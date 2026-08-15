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
//! single `Signer::External` instead of a threshold policy (this contract
//! isn't a multisig, it's a single-key agent account), and no
//! `ExecutionEntryPoint`/`Upgradeable` (this account never initiates calls
//! on its own behalf and isn't upgradeable, so both would be unused
//! surface area).
//!
//! ## Why `Signer::External`, not `Signer::Delegated`
//!
//! The first version of this contract used `Signer::Delegated(agent_key)`.
//! Every real transaction built against it trapped inside `__check_auth`
//! (`UnreachableCodeReached`), and an extensive isolation process never
//! found the cause; see `docs/DEFERRED.md`'s Phase 6b section and
//! `OpenZeppelin/stellar-contracts#839`. Reviewing
//! `stellar_accounts::smart_account::storage::authenticate`'s two arms
//! side by side explains why `Delegated` is the harder path structurally:
//! it verifies via `addr.require_auth_for_args((auth_digest,))`, which
//! requires a *second*, separately signed `SorobanAuthorizationEntry`
//! nested inside the account's own entry, hand-constructed since
//! simulation's `needsNonInvokerSigningBy()` only surfaces the top-level
//! entry. `External`'s arm instead makes one cross-contract call to a
//! deployed `Verifier` (`agent-verifier` in this repo, wrapping
//! `stellar_accounts::verifiers::ed25519`) with a raw Ed25519 signature,
//! entirely inside the smart account's own single entry: no nested entry,
//! no second signer to coordinate.
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
//! ## Why there are two context rules, not one
//!
//! `UptoSettlement::settle` pulls the buyer's tokens with a direct SEP-41
//! `transfer(&authorization.from, &this, &authorization.max_amount)`, not
//! an `approve`/`transfer_from` allowance (see that module's own doc for
//! why `upto` can't use an allowance). A plain `transfer` requires its own
//! `from.require_auth_for_args(...)`, so a real `settle()` call presents
//! this account's `__check_auth` with *two* contexts in one invocation:
//! the top-level call into `upto_settlement`, and the nested call into the
//! asset contract itself. Each needs its own matching `ContextRuleType::
//! CallContract`, so the constructor installs one rule per contract,
//! sharing the same signer and covering nothing else.
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
    Address, Bytes, BytesN, Env, Map, String, Val, Vec,
};
use stellar_accounts::smart_account::{
    self, AuthPayload, ContextRule, ContextRuleType, Signer, SmartAccount, SmartAccountError,
};

#[contract]
pub struct AgentSmartAccount;

#[contractimpl]
impl AgentSmartAccount {
    /// Creates the account with exactly two context rules: authorize calls
    /// to `upto_settlement`, and authorize the SEP-41 `transfer` call
    /// `settle` makes on `asset` to pull the buyer's funds. Both signed by
    /// a raw Ed25519 signature over `agent_pubkey`, checked via a
    /// cross-contract call to `verifier` (the deployed `agent-verifier`
    /// contract). `agent_key` never needs to be a funded G-account or sign
    /// a Soroban auth entry of its own: only the raw keypair matters,
    /// `agent_pubkey` is its public half.
    pub fn __constructor(
        e: &Env,
        verifier: Address,
        agent_pubkey: BytesN<32>,
        upto_settlement: Address,
        asset: Address,
    ) {
        let key_data = Bytes::from_slice(e, &agent_pubkey.to_array());
        let signer = Signer::External(verifier, key_data);
        smart_account::add_context_rule(
            e,
            &ContextRuleType::CallContract(upto_settlement),
            &String::from_str(e, "upto-settlement-only"),
            None,
            &Vec::from_array(e, [signer.clone()]),
            &soroban_sdk::Map::new(e),
        );
        smart_account::add_context_rule(
            e,
            &ContextRuleType::CallContract(asset),
            &String::from_str(e, "asset-transfer-only"),
            None,
            &Vec::from_array(e, [signer]),
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
