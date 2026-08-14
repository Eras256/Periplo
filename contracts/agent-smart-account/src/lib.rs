#![no_std]

//! `AgentSmartAccount` — Phase 6b's real OpenZeppelin `stellar-accounts`
//! integration: a smart account for an agent's key, scoped so it can only
//! ever authorize calls to one specific contract (the deployed
//! `UptoSettlement` instance), never anything else.
//!
//! Built directly on `stellar_accounts::smart_account` (MIT,
//! `OpenZeppelin/stellar-contracts`), adapted from that crate's own
//! `multisig-smart-account` example: same `SmartAccount`/
//! `CustomAccountInterface` wiring, one `ContextRule` instead of many, a
//! single `Signer::Delegated` instead of a threshold policy (this contract
//! isn't a multisig, it's a single-key agent account), and no
//! `ExecutionEntryPoint`/`Upgradeable` (this account never initiates calls
//! on its own behalf and isn't upgradeable, so both would be unused
//! surface area).
//!
//! ## Why `CallContract`, not `Default`
//!
//! `ContextRuleType::CallContract(upto_settlement_address)` is what makes
//! "an agent key that can only spend through the settlement contract" a
//! real, enforced property rather than a naming convention: `__check_auth`
//! rejects any authorization request whose `Context` targets a different
//! contract, regardless of what the agent's own key would otherwise sign.
//! `ContextRuleType::Default` (the shape OpenZeppelin's own example uses)
//! would authorize the agent's key for *any* contract call, which is
//! exactly the unscoped blast radius this contract exists to avoid.
//!
//! ## Why the reserved budget lives in `UptoSettlement`, not here
//!
//! See `contracts/upto-settlement/src/budget.rs`'s module doc: the stock
//! `stellar_accounts::policies::spending_limit` policy reads the amount
//! straight out of the `Context` a `settle` call presents, and that
//! `Context`'s args are `(authorization,)` only, never `actual_amount` —
//! by design, the whole point of `require_auth_for_args` restricted to that
//! tuple is keeping the real charge outside what gets signed. No policy
//! attached at this layer can ever see the number a budget actually needs
//! to reconcile against, so this contract deliberately carries no policy at
//! all; budget enforcement is `UptoSettlement`'s own responsibility,
//! reconciled at the one place in the call graph where `actual_amount` is
//! genuinely known.

use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contractimpl,
    crypto::Hash,
    Address, Env, Map, String, Val, Vec,
};
use stellar_accounts::smart_account::{
    self, AuthPayload, ContextRule, ContextRuleType, Signer, SmartAccount, SmartAccountError,
};

#[contract]
pub struct AgentSmartAccount;

#[contractimpl]
impl AgentSmartAccount {
    /// Creates the account with exactly one context rule: authorize calls
    /// to `upto_settlement` only, signed by `agent_key`'s own native
    /// signature (a `Signer::Delegated` verifies via that address's own
    /// `require_auth_for_args`, so `agent_key` can be an ordinary funded
    /// G-account — no separate verifier contract or passkey setup needed
    /// for this scenario).
    pub fn __constructor(e: &Env, agent_key: Address, upto_settlement: Address) {
        smart_account::add_context_rule(
            e,
            &ContextRuleType::CallContract(upto_settlement),
            &String::from_str(e, "upto-settlement-only"),
            None,
            &Vec::from_array(e, [Signer::Delegated(agent_key)]),
            &soroban_sdk::Map::new(e),
        );
    }
}

#[contractimpl]
impl CustomAccountInterface for AgentSmartAccount {
    type Error = SmartAccountError;
    type Signature = AuthPayload;

    fn __check_auth(
        e: Env,
        signature_payload: Hash<32>,
        signatures: AuthPayload,
        auth_contexts: Vec<Context>,
    ) -> Result<(), Self::Error> {
        smart_account::do_check_auth(&e, &signature_payload, &signatures, &auth_contexts)
    }
}

#[contractimpl(contracttrait)]
impl SmartAccount for AgentSmartAccount {}

mod test;
