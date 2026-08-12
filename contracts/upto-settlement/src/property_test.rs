#![cfg(test)]
//! Property-based tests locking down the invariants the unit tests in
//! `test.rs` check at fixed points. `proptest` generates the values;
//! `SorobanArbitrary` (available under `testutils`) is what backs fuzzing
//! with `cargo-fuzz` on contract types — this file runs under plain `cargo
//! test`, no nightly toolchain required, and is the CI-enforced regression
//! net per the smart-contracts skill's fuzz-then-lock-in-as-proptest
//! workflow.
extern crate std;

use crate::test::*;
use crate::{Error, MAX_WINDOW_LEDGERS};
use proptest::prelude::*;
use soroban_sdk::{testutils::Ledger as _, Env, Error as SdkError};

const CURRENT_LEDGER: u32 = 1_000;

proptest! {
    /// For any max_amount and any actual_amount within [0, max_amount], a
    /// single settlement moves exactly actual_amount to `to`, refunds
    /// exactly the remainder to `from`, and leaves the contract at zero
    /// balance — regardless of how the ceiling and the charge are chosen.
    #[test]
    fn settlement_conserves_value_for_any_amount_within_the_ceiling(
        max_amount in 0i128..=1_000_000_000i128,
        actual_fraction in 0.0f64..=1.0f64,
    ) {
        let actual_amount = ((max_amount as f64) * actual_fraction) as i128;
        prop_assume!(actual_amount >= 0 && actual_amount <= max_amount);

        let f = setup_at(max_amount.max(1), CURRENT_LEDGER);
        let a = auth(&f, max_amount, 0, CURRENT_LEDGER + 100, 1);

        client(&f).settle(&a, &actual_amount);

        prop_assert_eq!(token(&f).balance(&f.to), actual_amount);
        prop_assert_eq!(token(&f).balance(&f.from), max_amount.max(1) - actual_amount);
        prop_assert_eq!(token(&f).balance(&f.contract_id), 0);
    }

    /// Any actual_amount strictly above max_amount is rejected, no matter
    /// how large either value is (within i128's safe multiplication range
    /// used by the test setup).
    #[test]
    fn settlement_above_the_ceiling_always_rejected(
        max_amount in 0i128..=1_000_000_000i128,
        overshoot in 1i128..=1_000_000i128,
    ) {
        let actual_amount = max_amount + overshoot;
        let f = setup_at(max_amount.max(1), CURRENT_LEDGER);
        let a = auth(&f, max_amount, 0, CURRENT_LEDGER + 100, 1);

        let result = client(&f).try_settle(&a, &actual_amount);
        prop_assert_eq!(result, Err(Ok(SdkError::from(Error::AmountExceedsMaximum))));
    }

    /// Any negative actual_amount is rejected regardless of max_amount.
    #[test]
    fn negative_actual_amount_always_rejected(
        max_amount in 0i128..=1_000_000_000i128,
        actual_amount in i128::MIN..=-1i128,
    ) {
        let f = setup_at(1, CURRENT_LEDGER);
        let a = auth(&f, max_amount, 0, CURRENT_LEDGER + 100, 1);

        let result = client(&f).try_settle(&a, &actual_amount);
        prop_assert_eq!(result, Err(Ok(SdkError::from(Error::NegativeAmount))));
    }

    /// Any ledger strictly outside [valid_after_ledger, deadline_ledger] is
    /// rejected, and any ledger inside it (with a window at or under
    /// MAX_WINDOW_LEDGERS) is accepted — the boundary is exact, not
    /// approximate, for the whole generated range.
    #[test]
    fn time_bounds_are_exact(
        window in 0u32..=MAX_WINDOW_LEDGERS,
        offset in -2_000i64..=2_000i64,
    ) {
        let valid_after = CURRENT_LEDGER;
        let deadline = CURRENT_LEDGER + window;
        let ledger = (CURRENT_LEDGER as i64 + offset).clamp(0, u32::MAX as i64) as u32;

        let f = setup_at(1_000, ledger);
        let a = auth(&f, 500, valid_after, deadline, 1);

        let result = client(&f).try_settle(&a, &100);
        if ledger < valid_after {
            prop_assert_eq!(result, Err(Ok(SdkError::from(Error::NotYetValid))));
        } else if ledger > deadline {
            prop_assert_eq!(result, Err(Ok(SdkError::from(Error::Expired))));
        } else {
            prop_assert!(result.is_ok());
        }
    }

    /// A window wider than MAX_WINDOW_LEDGERS is always rejected, at any
    /// ledger that would otherwise satisfy the plain valid_after/deadline
    /// bounds.
    #[test]
    fn oversized_windows_always_rejected(
        extra in 1u32..=1_000_000u32,
    ) {
        let f = setup_at(1_000, CURRENT_LEDGER);
        let a = auth(&f, 500, 0, CURRENT_LEDGER + MAX_WINDOW_LEDGERS + extra, 1);

        let result = client(&f).try_settle(&a, &100);
        prop_assert_eq!(result, Err(Ok(SdkError::from(Error::WindowTooLong))));
    }

    /// Once a nonce is consumed, no second actual_amount value — including
    /// zero, the maximum, or anything in between — can settle against it
    /// again.
    #[test]
    fn a_consumed_nonce_rejects_every_subsequent_actual_amount(
        max_amount in 1i128..=1_000_000i128,
        first_amount_fraction in 0.0f64..=1.0f64,
        second_amount_fraction in 0.0f64..=1.0f64,
    ) {
        let first_amount = ((max_amount as f64) * first_amount_fraction) as i128;
        let second_amount = ((max_amount as f64) * second_amount_fraction) as i128;

        let f = setup_at(max_amount, CURRENT_LEDGER);
        let a = auth(&f, max_amount, 0, CURRENT_LEDGER + 100, 1);

        client(&f).settle(&a, &first_amount);
        let result = client(&f).try_settle(&a, &second_amount);
        prop_assert_eq!(result, Err(Ok(SdkError::from(Error::AuthorizationConsumed))));
    }
}

/// Test-only helper: like `setup` in `test.rs`, but with an explicit
/// current ledger (so time-bound properties can be checked at arbitrary
/// ledgers, not just the fixed one `setup` pins) and snapshot capture
/// disabled — each property runs hundreds of randomized cases, and a
/// snapshot per case is pure disk noise, not regression evidence worth
/// keeping (see the doc comment on `test::setup_with_env`).
pub(crate) fn setup_at(supply: i128, ledger: u32) -> Fixture {
    let env = Env::new_with_config(soroban_sdk::testutils::EnvTestConfig {
        capture_snapshot_at_drop: false,
    });
    env.ledger().with_mut(|l| {
        l.sequence_number = ledger;
    });
    setup_with_env(env, supply.max(1))
}
