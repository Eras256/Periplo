#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{symbol_short, testutils::Address as _, vec, Bytes, Map, TryFromVal, Val};

/// `agent-smart-account` (soroban-sdk 26.1.1, to match the real published
/// `stellar-accounts` crate) and `upto-settlement` (soroban-sdk 27.0.5, to
/// match the live testnet protocol version Phase 6 was built and deployed
/// against) cannot share a Rust `Env` type in the same test binary: that
/// would require importing both crates' incompatible soroban-sdk versions
/// into one dependency graph, the exact conflict
/// `contracts/upto-settlement/src/budget.rs`'s module doc documents finding
/// and deliberately avoiding. A genuine same-process Rust cross-contract
/// test between the two is therefore not possible with this architecture.
///
/// What this file proves instead: the account's own authorization decision,
/// directly, via real `__check_auth` invocations (called through
/// `env.as_contract`, the same pattern OpenZeppelin's own test suite uses
/// to exercise storage-dependent internals directly, not the generated
/// Client, since `__check_auth` is a host-invoked entry point the standard
/// Client doesn't expose). This is the actually novel claim ("an agent key
/// that can only spend through the settlement contract" is enforced, not
/// just documented): whether `UptoSettlement` correctly accepts a contract
/// address as `authorization.from` is proven the stronger way: a real,
/// cross-contract testnet transaction, recorded in
/// `conformance/RESULTS.md`.
///
/// `MockVerifierContract` matches `stellar-accounts`' own test convention
/// (`src/smart_account/test/context_rules.rs`): a stand-in `Verifier` whose
/// `verify` always returns `true`, so these tests exercise the account's own
/// authorization decision (scoping, signer recognition) without also
/// re-testing Ed25519 cryptography that `contracts/agent-verifier`'s own
/// test suite already covers with real signatures.
#[contract]
struct MockVerifierContract;

#[contractimpl]
impl MockVerifierContract {
    pub fn verify(_e: Env, _hash: Bytes, _key_data: Val, _sig_data: Val) -> bool {
        true
    }

    pub fn canonicalize_key(e: Env, key_data: Val) -> Bytes {
        Bytes::try_from_val(&e, &key_data).unwrap()
    }

    pub fn batch_canonicalize_key(e: Env, key_data: Vec<Val>) -> Vec<Bytes> {
        Vec::from_iter(&e, key_data.iter().map(|key| Bytes::try_from_val(&e, &key).unwrap()))
    }
}

fn create_signatures(e: &Env, verifier: &Address, agent_pubkey: &BytesN<32>, context_rule_id: u32) -> AuthPayload {
    let mut signers = Map::new(e);
    let key_data = Bytes::from_slice(e, &agent_pubkey.to_array());
    // The mock verifier accepts any sig_data unconditionally, so this can be
    // empty: `authenticate`'s External arm forwards it as-is to the
    // verifier's own `verify`, never inspects it itself.
    signers.set(Signer::External(verifier.clone(), key_data), Bytes::new(e));
    AuthPayload {
        signers,
        context_rule_ids: soroban_sdk::Vec::from_array(e, [context_rule_id]),
    }
}

fn context(contract: Address, fn_name: soroban_sdk::Symbol, args: Vec<Val>) -> Context {
    Context::Contract(soroban_sdk::auth::ContractContext {
        contract,
        fn_name,
        args,
    })
}

fn digest(e: &Env) -> soroban_sdk::crypto::Hash<32> {
    e.crypto()
        .sha256(&Bytes::from_array(e, b"phase-6b-test-payload"))
}

#[test]
fn check_auth_succeeds_for_a_call_to_the_registered_contract() {
    let e = Env::default();
    e.mock_all_auths();

    let verifier = e.register(MockVerifierContract, ());
    let agent_pubkey = BytesN::from_array(&e, &[1u8; 32]);
    let upto_settlement = Address::generate(&e);
    let asset = Address::generate(&e);
    let account_id = e.register(
        AgentSmartAccount,
        (verifier.clone(), agent_pubkey.clone(), upto_settlement.clone(), asset),
    );

    let rule = e.as_contract(&account_id, || smart_account::get_context_rule(&e, 0));
    assert_eq!(
        rule.context_type,
        ContextRuleType::CallContract(upto_settlement.clone())
    );

    let ctx = context(upto_settlement, symbol_short!("settle"), vec![&e]);
    let signatures = create_signatures(&e, &verifier, &agent_pubkey, rule.id);
    let payload_hash = digest(&e);

    let result: Result<(), SmartAccountError> = e.as_contract(&account_id, || {
        AgentSmartAccount::__check_auth(e.clone(), payload_hash, signatures, vec![&e, ctx])
    });
    assert!(
        result.is_ok(),
        "a call scoped to the registered contract must be authorized"
    );
}

#[test]
fn check_auth_succeeds_for_the_nested_asset_transfer_alongside_settle() {
    // A real settle() call presents __check_auth with TWO contexts in one
    // invocation (the top-level settle call, and the nested SEP-41
    // transfer()), see this module's own doc for why. Both must validate
    // together against context_rule_ids aligned by index to auth_contexts,
    // matching stellar-accounts' own do_check_auth_multiple_contexts_success
    // convention.
    let e = Env::default();
    e.mock_all_auths();

    let verifier = e.register(MockVerifierContract, ());
    let agent_pubkey = BytesN::from_array(&e, &[1u8; 32]);
    let upto_settlement = Address::generate(&e);
    let asset = Address::generate(&e);
    let account_id = e.register(
        AgentSmartAccount,
        (verifier.clone(), agent_pubkey.clone(), upto_settlement.clone(), asset.clone()),
    );

    let settle_rule = e.as_contract(&account_id, || smart_account::get_context_rule(&e, 0));
    let transfer_rule = e.as_contract(&account_id, || smart_account::get_context_rule(&e, 1));
    assert_eq!(
        transfer_rule.context_type,
        ContextRuleType::CallContract(asset.clone())
    );

    let settle_ctx = context(upto_settlement, symbol_short!("settle"), vec![&e]);
    let transfer_ctx = context(asset, symbol_short!("transfer"), vec![&e]);

    let mut signers = Map::new(&e);
    let key_data = Bytes::from_slice(&e, &agent_pubkey.to_array());
    signers.set(Signer::External(verifier, key_data), Bytes::new(&e));
    let signatures = AuthPayload {
        signers,
        context_rule_ids: soroban_sdk::Vec::from_array(&e, [settle_rule.id, transfer_rule.id]),
    };
    let payload_hash = digest(&e);

    let result: Result<(), SmartAccountError> = e.as_contract(&account_id, || {
        AgentSmartAccount::__check_auth(
            e.clone(),
            payload_hash,
            signatures,
            vec![&e, settle_ctx, transfer_ctx],
        )
    });
    assert!(
        result.is_ok(),
        "both the settle call and its nested asset transfer must be authorized together"
    );
}

#[test]
fn check_auth_rejects_a_call_to_a_different_contract() {
    // The core claim of this whole contract: an agent key wrapped in this
    // account cannot authorize spending through anything except the one
    // contract its context rule names, even with a fully valid signature.
    let e = Env::default();
    e.mock_all_auths();

    let verifier = e.register(MockVerifierContract, ());
    let agent_pubkey = BytesN::from_array(&e, &[1u8; 32]);
    let upto_settlement = Address::generate(&e);
    let asset = Address::generate(&e);
    let account_id = e.register(
        AgentSmartAccount,
        (verifier.clone(), agent_pubkey.clone(), upto_settlement, asset),
    );

    let rule = e.as_contract(&account_id, || smart_account::get_context_rule(&e, 0));

    let some_other_contract = Address::generate(&e);
    let ctx = context(some_other_contract, symbol_short!("transfer"), vec![&e]);
    let signatures = create_signatures(&e, &verifier, &agent_pubkey, rule.id);
    let payload_hash = digest(&e);

    // do_check_auth panics on a context/rule mismatch rather than returning
    // Err (confirmed by running this exact call without the catch first:
    // Error(Contract, #3002), a real host-level rejection, not assumed from
    // the return type alone). Caught here rather than asserted as a plain
    // Result, since this call goes straight to the contract impl function,
    // not through a generated Client's try_ wrapper that would normally
    // convert a host panic into a catchable Result.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        e.as_contract(&account_id, || {
            AgentSmartAccount::__check_auth(e.clone(), payload_hash, signatures, vec![&e, ctx])
        })
    }));
    assert!(
        result.is_err(),
        "a call to a contract other than the one this account is scoped to must be rejected"
    );
}

#[test]
fn check_auth_rejects_an_unrecognized_signer() {
    let e = Env::default();
    e.mock_all_auths();

    let verifier = e.register(MockVerifierContract, ());
    let agent_pubkey = BytesN::from_array(&e, &[1u8; 32]);
    let stranger_pubkey = BytesN::from_array(&e, &[2u8; 32]);
    let upto_settlement = Address::generate(&e);
    let asset = Address::generate(&e);
    let account_id = e.register(
        AgentSmartAccount,
        (verifier.clone(), agent_pubkey, upto_settlement.clone(), asset),
    );

    let rule = e.as_contract(&account_id, || smart_account::get_context_rule(&e, 0));

    let ctx = context(upto_settlement, symbol_short!("settle"), vec![&e]);
    // A signature keyed to a signer the account never registered.
    let signatures = create_signatures(&e, &verifier, &stranger_pubkey, rule.id);
    let payload_hash = digest(&e);

    // See the panic-vs-Result note in check_auth_rejects_a_call_to_a_different_contract.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        e.as_contract(&account_id, || {
            AgentSmartAccount::__check_auth(e.clone(), payload_hash, signatures, vec![&e, ctx])
        })
    }));
    assert!(
        result.is_err(),
        "a signature from an unregistered signer must be rejected"
    );
}
