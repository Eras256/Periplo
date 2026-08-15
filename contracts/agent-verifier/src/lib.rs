#![no_std]

//! `AgentVerifier` — a deployable Ed25519 `Verifier` contract for Phase 6b's
//! retry of the `agent-smart-account` scenario.
//!
//! `stellar_accounts::verifiers::ed25519` ships the verification logic as
//! plain functions, not a contract: `Signer::External(Address, Bytes)`
//! calls out to a separate deployed contract implementing `verify`/
//! `canonicalize_key`/`batch_canonicalize_key` (see
//! `stellar_accounts::smart_account::storage::authenticate`, the `External`
//! arm cross-calls a `VerifierClient` at the stored `Address`). This crate
//! is that thin wrapper, nothing more: no state, no admin, no upgrade path.
//!
//! ## Why this exists at all: `Signer::External`, not `Signer::Delegated`
//!
//! `agent-smart-account`'s first attempt used `Signer::Delegated(agent_key)`.
//! `Delegated`'s own verification path
//! (`addr.require_auth_for_args((auth_digest,))`) requires a *second*,
//! separately signed `SorobanAuthorizationEntry` nested inside the smart
//! account's own entry, constructed by hand since simulation's
//! `needsNonInvokerSigningBy()` only surfaces the top-level entry. Every
//! constructed transaction trapped inside `__check_auth`
//! (`UnreachableCodeReached`) before `do_check_auth`'s own logic ran, and
//! isolation work never found the cause (see `docs/DEFERRED.md`'s Phase 6b
//! section and `OpenZeppelin/stellar-contracts#839`).
//!
//! `Signer::External`, by contrast, verifies a raw Ed25519 signature against
//! a registered public key via one cross-contract call to this verifier,
//! entirely within the smart account's own single `SorobanAuthorizationEntry`.
//! No nested entry, no second signer to coordinate. Reviewing
//! `stellar_accounts::smart_account::storage::authenticate`'s two arms side
//! by side is what motivated retrying with this one instead.

use soroban_sdk::{contract, contractimpl, Bytes, BytesN, Env, Vec};
use stellar_accounts::verifiers::ed25519;

#[contract]
pub struct AgentVerifier;

#[contractimpl]
impl AgentVerifier {
    pub fn verify(e: Env, hash: Bytes, key_data: BytesN<32>, sig_data: BytesN<64>) -> bool {
        ed25519::verify(&e, &hash, &key_data, &sig_data)
    }

    pub fn canonicalize_key(e: Env, key_data: BytesN<32>) -> Bytes {
        ed25519::canonicalize_key(&e, &key_data)
    }

    pub fn batch_canonicalize_key(e: Env, key_data: Vec<BytesN<32>>) -> Vec<Bytes> {
        ed25519::batch_canonicalize_key(&e, &key_data)
    }
}

mod test;
