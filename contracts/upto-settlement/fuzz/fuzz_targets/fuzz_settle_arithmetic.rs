#![no_main]

//! Fuzzes `settle`'s value-moving and time-bound logic across the full
//! `i128` input space (amounts) and a realistic-but-generous slice of the
//! `u32` ledger-sequence space, with authorization always granted
//! (`mock_all_auths`) so every run reaches the arithmetic, the discrete
//! auth-approval/rejection paths (missing buyer auth, missing facilitator
//! auth, tampered recipient, wrong facilitator) are exhaustively covered by
//! name in `src/test.rs` and across the full numeric range in
//! `src/property_test.rs`; auth is a small enumerable state space where
//! hand-written and property tests already give complete coverage, so this
//! target spends its budget where fuzzing actually earns its keep: the
//! ceiling/time-bound/nonce arithmetic against genuinely adversarial,
//! coverage-guided values property tests wouldn't think to try.
//!
//! The buyer is minted an amount large enough that "insufficient balance"
//! is never the reason a settlement fails: every rejection observed here
//! must be one of this contract's own typed `Error` variants, or the
//! target panics deliberately so libFuzzer reports it as a finding.
//!
//! Ledger sequences are clamped to `0..REALISTIC_MAX_LEDGER`
//! (~100M ledgers, ~16 years at 5s/ledger, already far beyond any
//! plausible deployment horizon). An earlier version of this harness fuzzed
//! the raw `u32` range and found a panic at ledger ~4.29 billion, isolated
//! (see docs/DEFERRED.md) to `soroban-sdk`'s own test-contract registration
//! running out of internal TTL headroom at that height, reproducible with
//! *no* `UptoSettlement` code involved at all. Real Stellar is nowhere near
//! that ledger height and won't be for centuries, so fuzzing that zone
//! exercises a testutils limitation, not this contract.

use libfuzzer_sys::fuzz_target;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env, Error as SdkError,
};
use upto_settlement::{Authorization, Error, UptoSettlement, UptoSettlementClient};

const REALISTIC_MAX_LEDGER: u32 = 100_000_000;

#[derive(Debug, arbitrary::Arbitrary)]
struct FuzzInput {
    max_amount: i128,
    actual_amount: i128,
    valid_after_ledger: u32,
    deadline_ledger: u32,
    current_ledger: u32,
}

fuzz_target!(|input: FuzzInput| {
    let valid_after_ledger = input.valid_after_ledger % REALISTIC_MAX_LEDGER;
    let deadline_ledger = input.deadline_ledger % REALISTIC_MAX_LEDGER;
    let current_ledger = input.current_ledger % REALISTIC_MAX_LEDGER;

    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| {
        l.sequence_number = current_ledger;
    });

    let contract_id = env.register(UptoSettlement, ());
    let from = Address::generate(&env);
    let to = Address::generate(&env);
    let facilitator = Address::generate(&env);

    let asset_admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(asset_admin);
    let asset = sac.address();
    // Fund `from` with exactly enough to cover any max_amount this
    // iteration generated (abs() because max_amount may be negative, that
    // path is rejected long before the pull leg, so what matters is the
    // pull leg is never balance-limited when max_amount is positive).
    // checked_abs().unwrap_or(i128::MAX) only differs from plain abs() at
    // i128::MIN, where abs() itself would overflow-panic in the harness.
    let supply = input.max_amount.checked_abs().unwrap_or(i128::MAX);
    StellarAssetClient::new(&env, &asset).mint(&from, &supply);

    let authorization = Authorization {
        from: from.clone(),
        to: to.clone(),
        asset: asset.clone(),
        max_amount: input.max_amount,
        valid_after_ledger,
        deadline_ledger,
        nonce: BytesN::from_array(&env, &[0u8; 32]),
        facilitator: facilitator.clone(),
    };

    let client = UptoSettlementClient::new(&env, &contract_id);
    let result = client.try_settle(&authorization, &input.actual_amount);

    let in_time_bounds = current_ledger >= valid_after_ledger
        && current_ledger <= deadline_ledger
        && deadline_ledger.saturating_sub(valid_after_ledger) <= upto_settlement::MAX_WINDOW_LEDGERS;
    let in_ceiling = input.actual_amount >= 0 && input.actual_amount <= input.max_amount;

    match result {
        Ok(_) => {
            // A reported success must mean every guard actually held:
            // never trust the return value alone.
            assert!(in_time_bounds, "settled outside the signed time window");
            assert!(in_ceiling, "settled an amount outside [0, max_amount]");

            let token = TokenClient::new(&env, &asset);
            assert_eq!(
                token.balance(&contract_id),
                0,
                "contract must never hold a balance after settle"
            );
            assert_eq!(token.balance(&to), input.actual_amount);
        }
        Err(Ok(sdk_err)) => {
            // A typed rejection must be one of this contract's own seven
            // variants, and it must be the *correct* one for why this
            // input was rejected, not just any error.
            let known = [
                Error::NotYetValid,
                Error::Expired,
                Error::WindowTooLong,
                Error::AmountExceedsMaximum,
                Error::NegativeAmount,
                Error::AuthorizationConsumed,
                Error::BalanceInvariantViolated,
            ];
            let matched = known.iter().find(|e| SdkError::from(**e) == sdk_err);
            let Some(matched) = matched else {
                panic!("settle rejected with an error this contract does not define: {sdk_err:?}");
            };

            match matched {
                Error::NotYetValid => assert!(current_ledger < valid_after_ledger),
                Error::Expired => assert!(current_ledger > deadline_ledger),
                Error::WindowTooLong => assert!(
                    deadline_ledger.saturating_sub(valid_after_ledger) > upto_settlement::MAX_WINDOW_LEDGERS
                ),
                Error::NegativeAmount => assert!(input.actual_amount < 0),
                Error::AmountExceedsMaximum => {
                    assert!(input.actual_amount < 0 || input.actual_amount > input.max_amount)
                }
                // A fresh env per iteration means a nonce can never
                // already be consumed, and the balance invariant can
                // never actually trip given the proportional mint above,
                // reaching either here would itself be the finding.
                //
                // Phase 6b: this target never calls install_budget, so
                // budget::reconcile is always a no-op (see budget.rs) and
                // none of the three budget-related variants can occur
                // either, reaching any of them here would itself be the
                // finding, same as the two above.
                Error::AuthorizationConsumed
                | Error::BalanceInvariantViolated
                | Error::InvalidBudget
                | Error::BudgetAlreadyInstalled
                | Error::BudgetExceeded => {
                    panic!("unreachable rejection reason hit: {matched:?}")
                }
            }
        }
        // Any other shape (host-level/conversion failure) with a supply
        // sized to max_amount indicates something this harness didn't
        // account for.
        Err(Err(invoke_err)) => {
            panic!("unexpected host-level failure, not one of this contract's typed errors: {invoke_err:?}");
        }
    }
});
