//! Phase 6b: optional per-buyer budget reconciliation, connecting
//! `UptoSettlement` to OpenZeppelin's `stellar-accounts` package (MIT,
//! already an allowed dependency).
//!
//! ## Why the stock `policies::spending_limit` policy can't be reused as-is
//!
//! OpenZeppelin's `SpendingLimitPolicy` (`stellar-accounts::policies::
//! spending_limit`) enforces a rolling-window budget by intercepting the
//! generic Soroban auth `Context` a smart account's `__check_auth` receives,
//! and reading the transfer amount straight out of that context's `args`
//! (`policies::spending_limit::enforce` matches on `fn_name ==
//! symbol_short!("transfer")` and reads `args.get(2)`). That works when the
//! smart account is directly authorizing a SEP-41 `transfer` call.
//!
//! It does not work for `upto`. The buyer's smart account authorizes
//! `UptoSettlement::settle`, not a raw `transfer`: `fn_name` is `"settle"`,
//! and the args the account's `__check_auth` ever sees are `(authorization,)`
//! only, because `require_auth_for_args` restricted to that tuple is the
//! entire mechanism that keeps `actual_amount` outside what the buyer signs
//! (see the module doc in `lib.rs`). `actual_amount`, the number a budget
//! actually needs to reconcile against, is never part of any `Context` a
//! policy's `enforce()` can read, by design. A policy attached the normal
//! way would either reject every `settle` call outright (wrong `fn_name`) or
//! have to fall back to charging the full `max_amount` against the budget,
//! which is exactly the "reconciled against the ceiling, not the real
//! charge" bug this feature exists to avoid.
//!
//! ## What this module does instead
//!
//! `UptoSettlement::settle` is the only place in the whole call graph where
//! `actual_amount` is known, so it is the only place that can reconcile a
//! budget against it correctly. This module is called directly from
//! `settle`, after `actual_amount` has passed every other check, and before
//! any transfer moves funds: it re-implements the same rolling-window
//! cleanup, limit check, and history-append algorithm as OpenZeppelin's own
//! `spending_limit::enforce`, keyed on `actual_amount` instead of a
//! transfer-context argument. The storage type is not reinvented: `install`,
//! `get_budget`, and the per-buyer storage key reuse OpenZeppelin's own
//! `SpendingLimitData`/`SpendingEntry` structs directly, so a buyer's budget
//! state is byte-for-byte the same shape OpenZeppelin's own tooling already
//! understands, only the write path (`settle`-time, actual-amount-keyed)
//! differs from theirs (`__check_auth`-time, transfer-arg-keyed).
//!
//! Budget enforcement is strictly opt-in per buyer: an authorization whose
//! `from` has no budget installed settles exactly as it did before this
//! module existed. This is a purely additive extension, not a behavior
//! change to the Phase 6 gate's existing 27 tests.
//!
//! ## Why `SpendingLimitData`/`SpendingEntry` are mirrored here, not imported
//!
//! The published `stellar-accounts` crate (crates.io, 0.7.2, the latest
//! stable as of this writing) pins `soroban-sdk ^26.1`. This project's
//! already-deployed Phase 6 contract targets `soroban-sdk 27.0.5`, matching
//! the live testnet protocol version it was built and verified against.
//! Adding `stellar-accounts` as a direct dependency of this crate pulls in
//! a second, incompatible `soroban-sdk` into the same dependency graph
//! (confirmed by a real build attempt, not assumed from the version
//! numbers: two distinct `soroban_sdk::Vec` types, neither convertible to
//! the other, `E0308`/`E0277` at every storage read/write). The upstream
//! `stellar-contracts` repo's own unreleased `main` branch has already
//! moved its workspace pin to `soroban-sdk 27.0.2`, so this is a real, if
//! temporary, publish lag rather than a permanent incompatibility, see
//! `docs/DEFERRED.md` for the finding.
//!
//! Downgrading this whole contract to `soroban-sdk 26.x` to accommodate an
//! optional feature was rejected: it would mean re-verifying the entire
//! already-deployed, already-proven Phase 6 gate against an older SDK for
//! the sake of a Phase 6b extension, a large blast radius for what should
//! be a purely additive change. Instead, `SpendingLimitData` and
//! `SpendingEntry` below are defined locally, field-for-field identical to
//! `stellar_accounts::policies::spending_limit`'s real published types, so
//! a buyer's budget state is still the same shape OpenZeppelin's own
//! tooling understands, just without forcing an SDK downgrade onto this
//! contract to get there. The separate `agent-smart-account` contract in
//! this repo (the actual buyer-side account used in the Phase 6b demo) has
//! no such conflict and depends on the real `stellar-accounts` crate
//! directly, unmirrored.

use soroban_sdk::{contracttype, panic_with_error, Address, Env, Vec};

use crate::Error;

/// Field-for-field identical to `stellar_accounts::policies::spending_limit::
/// SpendingLimitData`. See the module doc for why this is mirrored rather
/// than imported.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct SpendingLimitData {
    pub spending_limit: i128,
    pub period_ledgers: u32,
    pub spending_history: Vec<SpendingEntry>,
    pub cached_total_spent: i128,
}

/// Field-for-field identical to `stellar_accounts::policies::spending_limit::
/// SpendingEntry`.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct SpendingEntry {
    pub amount: i128,
    pub ledger_sequence: u32,
}

#[contracttype]
pub enum BudgetKey {
    /// One budget slot per buyer address. `upto` authorizations always name
    /// exactly one settlement contract per authorization (the deployed
    /// `UptoSettlement` instance itself), so unlike OpenZeppelin's own
    /// per-`(smart_account, context_rule_id)` keying (needed because one
    /// smart account can hold many context rules across many contracts),
    /// one slot per buyer is the whole address space this contract ever
    /// needs to key on.
    Budget(Address),
}

/// Installs a reserved budget for `buyer`. Requires `buyer`'s own
/// authorization, so only the account itself (its own `__check_auth`, for a
/// smart account) can set its budget, never a facilitator or a third party.
///
/// # Panics
/// * If a budget is already installed for `buyer` (call `set_budget` to
///   change an existing one instead).
/// * If `spending_limit <= 0` or `period_ledgers == 0`.
pub fn install(env: &Env, buyer: &Address, spending_limit: i128, period_ledgers: u32) {
    buyer.require_auth();

    if spending_limit <= 0 || period_ledgers == 0 {
        panic_with_error!(env, Error::InvalidBudget);
    }

    let key = BudgetKey::Budget(buyer.clone());
    if env.storage().persistent().has(&key) {
        panic_with_error!(env, Error::BudgetAlreadyInstalled);
    }

    let data = SpendingLimitData {
        spending_limit,
        period_ledgers,
        spending_history: Vec::new(env),
        cached_total_spent: 0,
    };
    env.storage().persistent().set(&key, &data);
}

/// Reads a buyer's current budget state, if any. Returns `None` for a buyer
/// with no budget installed, so `settle` can tell "no budget configured"
/// (skip enforcement entirely) apart from "budget configured and fully
/// spent" (enforce, and likely reject).
pub fn get_budget(env: &Env, buyer: &Address) -> Option<SpendingLimitData> {
    env.storage()
        .persistent()
        .get(&BudgetKey::Budget(buyer.clone()))
}

/// Removes stale entries outside the rolling window, mirroring
/// OpenZeppelin's own `spending_limit` cleanup exactly (same cutoff
/// semantics: an entry is evicted once its ledger sequence is `<=
/// current_ledger - period_ledgers`).
fn evict_expired(
    history: &mut Vec<SpendingEntry>,
    current_ledger: u32,
    period_ledgers: u32,
) -> i128 {
    let cutoff = current_ledger.saturating_sub(period_ledgers);
    let mut removed = 0i128;
    while let Some(entry) = history.get(0) {
        if entry.ledger_sequence <= cutoff {
            removed += entry.amount;
            history.pop_front();
        } else {
            break;
        }
    }
    removed
}

/// Reconciles `actual_amount` against `buyer`'s reserved budget, if one is
/// installed. A no-op (returns immediately) when no budget exists for
/// `buyer` — this is what makes budget enforcement strictly opt-in.
///
/// Called from `settle` after `actual_amount` is known and validated against
/// `max_amount`, before any transfer moves funds, so a budget rejection
/// reverts the whole settlement atomically, the same fail-fast discipline
/// every other check in `settle` already follows.
///
/// # Panics
/// * [`Error::BudgetExceeded`] — if `actual_amount` would push the buyer's
///   spend in the current rolling window over their reserved limit. A
///   zero `actual_amount` never triggers this: spending nothing can't
///   exceed any positive budget, matching OpenZeppelin's own "a zero-amount
///   transfer has no effect on the spending budget" rule in
///   `spending_limit::enforce`.
pub fn reconcile(env: &Env, buyer: &Address, actual_amount: i128) {
    let key = BudgetKey::Budget(buyer.clone());
    let Some(mut data) = env.storage().persistent().get::<_, SpendingLimitData>(&key) else {
        return;
    };

    if actual_amount == 0 {
        return;
    }

    let current_ledger = env.ledger().sequence();
    let removed = evict_expired(
        &mut data.spending_history,
        current_ledger,
        data.period_ledgers,
    );
    data.cached_total_spent -= removed;

    if data.cached_total_spent + actual_amount > data.spending_limit {
        panic_with_error!(env, Error::BudgetExceeded);
    }

    data.spending_history.push_back(SpendingEntry {
        amount: actual_amount,
        ledger_sequence: current_ledger,
    });
    data.cached_total_spent += actual_amount;

    env.storage().persistent().set(&key, &data);
}
