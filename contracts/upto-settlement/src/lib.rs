#![no_std]

//! `UptoSettlement`: the Soroban contract behind the x402 `upto` scheme's
//! `contract` profile on Stellar. Full protocol writeup:
//! `specs/schemes/upto/scheme_upto_stellar.md` in x402-foundation/x402#3098
//! (open draft PR; this crate is the reference implementation named there).
//!
//! `upto` authorizes a transfer of **up to** a maximum amount, with the
//! settled amount fixed only at settlement time, after the resource has
//! been consumed and metered, not when the buyer signs. A SEP-41 allowance
//! (`approve`/`transfer_from`) cannot express this: it fails **recipient
//! binding** (`transfer_from` lets the spender choose any `to`) and
//! **single-use** (an allowance is a standing balance, drawable repeatedly).
//! Both are `MUST` core properties of `upto`, so a contract-free design is
//! non-conformant.
//!
//! `require_auth_for_args` restricted to `(authorization,)` is what makes
//! this expressible: it keeps `actual_amount` outside what the buyer signs.
//! A plain `require_auth()` would authorize the full argument list including
//! the charge, forcing the buyer to know it at signing time and collapsing
//! `upto` into `exact`.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error,
    token::TokenClient, Address, BytesN, Env, IntoVal,
};

/// Contract-level ceiling on `deadline_ledger - valid_after_ledger`,
/// independent of and tighter than the network's own storage-TTL ceiling
/// (`state_archival.max_entry_ttl`; 3,110,400 ledgers on testnet, checked
/// live against `stellar network settings --network testnet` rather than
/// assumed, see docs/DEFERRED.md). x402 authorizations are meant to be
/// short-lived (`maxTimeoutSeconds` defaults to 60s, ~12 ledgers at
/// 5s/ledger); a window even approaching a day is already outside normal
/// use and worth rejecting outright rather than silently accepting whatever
/// the network would still technically allow.
pub const MAX_WINDOW_LEDGERS: u32 = 17_280; // ~1 day at 5s/ledger

/// The struct the buyer signs. Every field is covered by
/// `require_auth_for_args((authorization,))`: nothing here can be swapped
/// after signing without invalidating the signature.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Authorization {
    /// Buyer. Authorizes this struct (not `actual_amount`) and the nested
    /// SEP-41 `transfer` sub-invocation for `max_amount`.
    pub from: Address,
    /// MUST equal the resource server's `payTo`: this is what makes
    /// recipient binding hold: `to` comes from what the buyer signed, never
    /// from an argument a facilitator could supply independently.
    pub to: Address,
    /// SEP-41 token contract address.
    pub asset: Address,
    /// Ceiling. `actual_amount` at settlement MUST NOT exceed this.
    pub max_amount: i128,
    pub valid_after_ledger: u32,
    pub deadline_ledger: u32,
    /// Single-use marker. MUST be a fresh, unpredictable 32 bytes per
    /// authorization: a predictable nonce lets an observer pre-consume it,
    /// denying service to the real buyer.
    pub nonce: BytesN<32>,
    /// Binds settlement to one operator so an intercepted payload can't be
    /// settled by anyone else. Mirrors `witness.facilitator` in the EVM
    /// `upto` profile.
    pub facilitator: Address,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Nonce(BytesN<32>),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotYetValid = 1,
    Expired = 2,
    WindowTooLong = 3,
    AmountExceedsMaximum = 4,
    NegativeAmount = 5,
    AuthorizationConsumed = 6,
    /// Structural invariant, not a buyer/facilitator input error: the
    /// contract must never hold a balance across transactions. See
    /// "Security considerations" in the spec: any implementation letting a
    /// balance persist has introduced custody this scheme is designed not
    /// to have.
    BalanceInvariantViolated = 7,
    /// Phase 6b: `install_budget` called with `spending_limit <= 0` or
    /// `period_ledgers == 0`.
    InvalidBudget = 8,
    /// Phase 6b: `install_budget` called for a buyer that already has a
    /// budget installed. Use `set_budget` to change an existing one.
    BudgetAlreadyInstalled = 9,
    /// Phase 6b: `actual_amount` would push the buyer's spend in the
    /// current rolling window over their reserved budget. See `budget.rs`
    /// for why this is reconciled against `actual_amount`, not
    /// `max_amount`.
    BudgetExceeded = 10,
}

/// Topics: `("settled", from, to)`. Emitted once per successful settlement,
/// after every check has passed and every transfer leg has run.
#[contractevent]
pub struct Settled {
    #[topic]
    pub from: Address,
    #[topic]
    pub to: Address,
    pub asset: Address,
    pub max_amount: i128,
    pub actual_amount: i128,
    pub nonce: BytesN<32>,
}

#[contract]
pub struct UptoSettlement;

#[contractimpl]
impl UptoSettlement {
    /// `actual_amount` is supplied by the facilitator at settlement time and
    /// is deliberately excluded from what `authorization.from` signs.
    ///
    /// Panics (never returns `Result`, matching the reference pseudocode in
    /// the spec) with a typed [`Error`] on every rejection path, so a
    /// facilitator can distinguish failure reasons from the transaction
    /// result without parsing a message string.
    pub fn settle(env: Env, authorization: Authorization, actual_amount: i128) {
        // --- 1a. Authorize the buyer for the authorization struct ONLY. ---
        // This single call is the entire mechanism that makes `upto`
        // expressible on Soroban: `actual_amount` never appears in the
        // signed payload, so the buyer can sign before the charge is known.
        authorization
            .from
            .require_auth_for_args((authorization.clone(),).into_val(&env));

        // --- 1b. The named facilitator must also consent to this specific
        // settlement call. In the deployed flow this is satisfied by the
        // facilitator being the submitting transaction's source account; a
        // mismatched or absent facilitator signature fails here regardless
        // of how the buyer's side was authorized. ---
        authorization.facilitator.require_auth();

        // --- 2. Time bounds. Ledger sequences, never timestamps, see the
        // module doc and the spec's "Ledger sequences, not timestamps"
        // section for why a fixed seconds-per-ledger assumption over long
        // horizons is explicitly disallowed. ---
        let ledger = env.ledger().sequence();
        if ledger < authorization.valid_after_ledger {
            panic_with_error!(&env, Error::NotYetValid);
        }
        if ledger > authorization.deadline_ledger {
            panic_with_error!(&env, Error::Expired);
        }
        // Unreachable with a negative result: reaching this line already
        // proves valid_after_ledger <= ledger <= deadline_ledger, so
        // deadline_ledger >= valid_after_ledger. saturating_sub is defense
        // in depth, not load-bearing.
        let window = authorization
            .deadline_ledger
            .saturating_sub(authorization.valid_after_ledger);
        if window > MAX_WINDOW_LEDGERS {
            panic_with_error!(&env, Error::WindowTooLong);
        }

        // --- 4. Ceiling. A negative max_amount is rejected here too: with
        // actual_amount already proven >= 0 below, actual_amount >
        // max_amount is true for any max_amount < 0, so no separate
        // max_amount >= 0 check is needed. ---
        if actual_amount < 0 {
            panic_with_error!(&env, Error::NegativeAmount);
        }
        if actual_amount > authorization.max_amount {
            panic_with_error!(&env, Error::AmountExceedsMaximum);
        }

        // --- 1c. Single use. Nonce lives in temporary storage: the deadline
        // dominates it, since an entry only needs to survive until
        // deadline_ledger, after which the authorization is unusable
        // regardless of nonce state (checked above, unconditionally, before
        // this point). extend_ttl(ttl, ttl) sizes the entry's TTL to cover
        // exactly deadline_ledger - ledger, bounded by MAX_WINDOW_LEDGERS
        // above, which is verified against the network's real TTL limits
        // rather than assumed, see docs/DEFERRED.md. ---
        let key = DataKey::Nonce(authorization.nonce.clone());
        if env.storage().temporary().has(&key) {
            panic_with_error!(&env, Error::AuthorizationConsumed);
        }
        let ttl = authorization.deadline_ledger.saturating_sub(ledger);
        env.storage()
            .temporary()
            .set(&key, &authorization.deadline_ledger);
        env.storage().temporary().extend_ttl(&key, ttl, ttl);

        // --- 1d. Phase 6b: reconcile actual_amount against the buyer's
        // reserved budget, if one is installed. A no-op for a buyer with no
        // budget (see budget.rs for why this can't be the stock
        // OpenZeppelin spending_limit policy attached the normal way, and
        // why actual_amount is the only correct thing to reconcile
        // against). Runs before any transfer, so a budget rejection
        // reverts the whole settlement atomically. ---
        budget::reconcile(&env, &authorization.from, actual_amount);

        // --- 3. Recipient binding + atomic pull-and-refund. `to` comes only
        // from the struct the buyer signed. The buyer's signed
        // sub-invocation is transfer(from, this_contract, max_amount); auth
        // entries commit to exact sub-invocation arguments, so this
        // contract cannot substitute a different destination or amount for
        // the pull leg even if it wanted to. Up to three transfers, all in
        // this one transaction, no custody window between them. ---
        let asset = TokenClient::new(&env, &authorization.asset);
        let this = env.current_contract_address();
        asset.transfer(&authorization.from, &this, &authorization.max_amount);
        if actual_amount > 0 {
            asset.transfer(&this, &authorization.to, &actual_amount);
        }
        let refund = authorization.max_amount - actual_amount;
        if refund > 0 {
            asset.transfer(&this, &authorization.from, &refund);
        }

        // A non-zero balance here means either a non-standard token (e.g.
        // fee-on-transfer) delivered less than requested, or an arithmetic
        // mistake above, either way the settlement must not silently
        // succeed with value stuck in the contract.
        if asset.balance(&this) != 0 {
            panic_with_error!(&env, Error::BalanceInvariantViolated);
        }

        Settled {
            from: authorization.from.clone(),
            to: authorization.to.clone(),
            asset: authorization.asset.clone(),
            max_amount: authorization.max_amount,
            actual_amount,
            nonce: authorization.nonce,
        }
        .publish(&env);
    }

    /// Phase 6b: reserves a spending budget for `buyer`, enforced against
    /// `actual_amount` (not `max_amount`) on every future `settle` call
    /// where `authorization.from == buyer`. Requires `buyer`'s own
    /// authorization; for a smart-account buyer this routes through its
    /// `__check_auth`, same as any other call the account authorizes.
    /// Strictly opt-in: a buyer that never calls this settles exactly as
    /// before Phase 6b existed. See `budget.rs` for the full reasoning.
    pub fn install_budget(env: Env, buyer: Address, spending_limit: i128, period_ledgers: u32) {
        budget::install(&env, &buyer, spending_limit, period_ledgers);
    }

    /// Phase 6b: reads a buyer's current budget state (limit, rolling
    /// window length, and cached total spent in the current window).
    /// Returns `None` if no budget is installed for `buyer`.
    pub fn get_budget(env: Env, buyer: Address) -> Option<budget::SpendingLimitData> {
        budget::get_budget(&env, &buyer)
    }
}

mod budget;
mod property_test;
mod test;
