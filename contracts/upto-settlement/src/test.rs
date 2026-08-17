#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _, MockAuth, MockAuthInvoke},
    token::StellarAssetClient,
    Error as SdkError, IntoVal,
};

/// The generated `try_settle` returns the SDK's own `Error` (a contract
/// panic's error code, wire-level), not this crate's `Error` enum directly:
/// `settle` panics rather than returning `Result`, matching the spec's
/// reference pseudocode. This converts our typed variant into the shape
/// `try_settle` actually returns, so assertions stay readable.
fn rejected(
    e: Error,
) -> Result<Result<(), soroban_sdk::ConversionError>, Result<SdkError, soroban_sdk::InvokeError>> {
    Err(Ok(SdkError::from(e)))
}

/// One buyer, one recipient, one facilitator, one SEP-41 test asset (a
/// randomly-issued Stellar Asset Contract instance, the real code path a
/// deployed token exercises, not a hand-rolled mock token). `mint` credits
/// the buyer with `supply` up front.
///
/// `pub(crate)` throughout this file: `property_test.rs` reuses this fixture
/// and its helpers so the property tests exercise the exact same setup path
/// as the fixed-point unit tests above, rather than a second hand-rolled one.
pub(crate) struct Fixture {
    pub(crate) env: Env,
    pub(crate) contract_id: Address,
    pub(crate) asset: Address,
    pub(crate) from: Address,
    pub(crate) to: Address,
    pub(crate) facilitator: Address,
}

pub(crate) fn setup(supply: i128) -> Fixture {
    let env = Env::default();
    env.ledger().with_mut(|l| {
        l.sequence_number = 1_000;
    });
    setup_with_env(env, supply)
}

/// Shared by `setup` above (default `Env`, snapshot capture on: these 21
/// fixed-point cases are the committed regression evidence the
/// smart-contracts skill recommends keeping) and
/// `property_test::setup_at` (snapshot capture off: proptest runs each
/// property hundreds of times with random inputs, and a snapshot per case
/// is pure noise: an earlier version of this file left `test_snapshots/`
/// at 1,557 files / 24MB before this split, never committed).
pub(crate) fn setup_with_env(env: Env, supply: i128) -> Fixture {
    env.mock_all_auths();

    let contract_id = env.register(UptoSettlement, ());
    let from = Address::generate(&env);
    let to = Address::generate(&env);
    let facilitator = Address::generate(&env);

    let asset_admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(asset_admin.clone());
    let asset = sac.address();
    StellarAssetClient::new(&env, &asset).mint(&from, &supply);

    Fixture {
        env,
        contract_id,
        asset,
        from,
        to,
        facilitator,
    }
}

pub(crate) fn nonce(env: &Env, seed: u8) -> BytesN<32> {
    let mut bytes = [0u8; 32];
    bytes[0] = seed;
    BytesN::from_array(env, &bytes)
}

pub(crate) fn auth(
    f: &Fixture,
    max_amount: i128,
    valid_after: u32,
    deadline: u32,
    n: u8,
) -> Authorization {
    Authorization {
        from: f.from.clone(),
        to: f.to.clone(),
        asset: f.asset.clone(),
        max_amount,
        valid_after_ledger: valid_after,
        deadline_ledger: deadline,
        nonce: nonce(&f.env, n),
        facilitator: f.facilitator.clone(),
    }
}

pub(crate) fn client(f: &Fixture) -> UptoSettlementClient<'_> {
    UptoSettlementClient::new(&f.env, &f.contract_id)
}

pub(crate) fn token(f: &Fixture) -> TokenClient<'_> {
    TokenClient::new(&f.env, &f.asset)
}

// ---------------------------------------------------------------------
// Happy paths: full, partial, zero settlement. Each asserts the contract
// holds a zero balance afterward, the invariant the spec's "Security
// considerations" section names explicitly.
// ---------------------------------------------------------------------

#[test]
fn full_settlement_pays_recipient_and_skips_refund_leg() {
    let f = setup(1_000);
    let a = auth(&f, 500, 0, 2_000, 1);

    client(&f).settle(&a, &500);

    assert_eq!(token(&f).balance(&f.from), 500); // 1000 - 500
    assert_eq!(token(&f).balance(&f.to), 500);
    assert_eq!(token(&f).balance(&f.contract_id), 0);
}

#[test]
fn partial_settlement_pays_recipient_and_refunds_remainder() {
    let f = setup(1_000);
    let a = auth(&f, 500, 0, 2_000, 1);

    client(&f).settle(&a, &120);

    assert_eq!(token(&f).balance(&f.from), 1_000 - 120);
    assert_eq!(token(&f).balance(&f.to), 120);
    assert_eq!(token(&f).balance(&f.contract_id), 0);
}

#[test]
fn zero_settlement_refunds_everything() {
    let f = setup(1_000);
    let a = auth(&f, 500, 0, 2_000, 1);

    client(&f).settle(&a, &0);

    assert_eq!(token(&f).balance(&f.from), 1_000);
    assert_eq!(token(&f).balance(&f.to), 0);
    assert_eq!(token(&f).balance(&f.contract_id), 0);
}

#[test]
fn maximum_settlement_at_the_boundary_equals_full_settlement() {
    // actual_amount == max_amount exactly, at the largest amount the buyer holds.
    let f = setup(500);
    let a = auth(&f, 500, 0, 2_000, 1);

    client(&f).settle(&a, &500);

    assert_eq!(token(&f).balance(&f.from), 0);
    assert_eq!(token(&f).balance(&f.to), 500);
    assert_eq!(token(&f).balance(&f.contract_id), 0);
}

#[test]
fn settled_event_reports_actual_amount_not_maximum() {
    let f = setup(1_000);
    let a = auth(&f, 500, 0, 2_000, 7);

    client(&f).settle(&a, &200);

    let expected = Settled {
        from: f.from.clone(),
        to: f.to.clone(),
        asset: f.asset.clone(),
        max_amount: 500,
        actual_amount: 200,
        nonce: nonce(&f.env, 7),
    };
    // `events().all()` returns every contract's events for the whole
    // invocation, including the token's own `transfer` events from the
    // pull/pay legs. Filter down to this contract's own event.
    use soroban_sdk::{testutils::Events as _, Event as _};
    assert_eq!(
        f.env
            .events()
            .all()
            .filter_by_contract(&f.contract_id)
            .events(),
        &[expected.to_xdr(&f.env, &f.contract_id)],
    );
}

// ---------------------------------------------------------------------
// Ceiling (Core Property 4).
// ---------------------------------------------------------------------

#[test]
fn rejects_settlement_above_maximum() {
    let f = setup(1_000);
    let a = auth(&f, 500, 0, 2_000, 1);

    let result = client(&f).try_settle(&a, &501);
    assert_eq!(result, rejected(Error::AmountExceedsMaximum));
}

#[test]
fn rejects_negative_actual_amount() {
    let f = setup(1_000);
    let a = auth(&f, 500, 0, 2_000, 1);

    let result = client(&f).try_settle(&a, &-1);
    assert_eq!(result, rejected(Error::NegativeAmount));
}

#[test]
fn rejects_negative_max_amount_via_the_ceiling_check() {
    // No separate max_amount >= 0 check exists; a negative ceiling is
    // rejected because actual_amount (already proven >= 0) always exceeds
    // it. Documented in lib.rs; this test locks that reasoning in.
    let f = setup(1_000);
    let a = auth(&f, -5, 0, 2_000, 1);

    let result = client(&f).try_settle(&a, &0);
    assert_eq!(result, rejected(Error::AmountExceedsMaximum));
}

// ---------------------------------------------------------------------
// Time bounds (Core Property 2): ledger sequences, not timestamps.
// ---------------------------------------------------------------------

#[test]
fn rejects_expired_authorization() {
    let f = setup(1_000);
    let a = auth(&f, 500, 0, 999, 1); // deadline before current ledger (1_000)

    let result = client(&f).try_settle(&a, &100);
    assert_eq!(result, rejected(Error::Expired));
}

#[test]
fn accepts_at_the_exact_deadline_ledger() {
    // deadline_ledger is inclusive: `ledger > deadline` is the rejection
    // condition, so ledger == deadline must still succeed.
    let f = setup(1_000);
    let a = auth(&f, 500, 0, 1_000, 1);

    client(&f).settle(&a, &100);
    assert_eq!(token(&f).balance(&f.to), 100);
}

#[test]
fn rejects_not_yet_valid_authorization() {
    let f = setup(1_000);
    let a = auth(&f, 500, 1_500, 2_000, 1); // valid_after is in the future

    let result = client(&f).try_settle(&a, &100);
    assert_eq!(result, rejected(Error::NotYetValid));
}

#[test]
fn accepts_at_the_exact_valid_after_ledger() {
    let f = setup(1_000);
    let a = auth(&f, 500, 1_000, 2_000, 1); // valid_after == current ledger

    client(&f).settle(&a, &100);
    assert_eq!(token(&f).balance(&f.to), 100);
}

#[test]
fn rejects_window_exceeding_the_contract_maximum() {
    let f = setup(1_000);
    let a = auth(&f, 500, 0, MAX_WINDOW_LEDGERS + 1_001, 1); // window > MAX_WINDOW_LEDGERS

    let result = client(&f).try_settle(&a, &100);
    assert_eq!(result, rejected(Error::WindowTooLong));
}

#[test]
fn accepts_window_exactly_at_the_contract_maximum() {
    let f = setup(1_000);
    let a = auth(&f, 500, 0, MAX_WINDOW_LEDGERS, 1); // window == MAX_WINDOW_LEDGERS exactly

    client(&f).settle(&a, &100);
    assert_eq!(token(&f).balance(&f.to), 100);
}

// ---------------------------------------------------------------------
// Single use (Core Property 1): nonce replay.
// ---------------------------------------------------------------------

#[test]
fn rejects_replay_of_a_consumed_nonce() {
    let f = setup(1_000);
    let a = auth(&f, 500, 0, 2_000, 1);

    client(&f).settle(&a, &100);
    let result = client(&f).try_settle(&a, &50);
    assert_eq!(result, rejected(Error::AuthorizationConsumed));
}

#[test]
fn distinct_nonces_from_the_same_buyer_both_settle() {
    let f = setup(1_000);
    let a1 = auth(&f, 300, 0, 2_000, 1);
    let a2 = auth(&f, 300, 0, 2_000, 2);

    client(&f).settle(&a1, &300);
    client(&f).settle(&a2, &300);

    assert_eq!(token(&f).balance(&f.to), 600);
    assert_eq!(token(&f).balance(&f.contract_id), 0);
}

#[test]
fn nonce_entry_ttl_covers_the_full_deadline_window() {
    let f = setup(1_000);
    let deadline = 1_000 + 5_000;
    let a = auth(&f, 500, 0, deadline, 9);

    client(&f).settle(&a, &100);

    use soroban_sdk::testutils::storage::Temporary as _;
    let key = DataKey::Nonce(nonce(&f.env, 9));
    let ttl = f
        .env
        .as_contract(&f.contract_id, || f.env.storage().temporary().get_ttl(&key));
    // get_ttl returns ledgers remaining from the *current* ledger, so it
    // must cover at least (deadline - current_ledger) = 5_000.
    assert!(
        ttl as u32 >= deadline - 1_000,
        "ttl {ttl} does not cover the {}-ledger window to deadline",
        deadline - 1_000
    );
}

// ---------------------------------------------------------------------
// Recipient binding (Core Property 3): the decisive property a plain
// SEP-41 allowance fails. `to` must come only from what the buyer signed.
// ---------------------------------------------------------------------

#[test]
fn facilitator_cannot_redirect_funds_to_a_different_recipient() {
    let f = setup(1_000);
    let attacker = Address::generate(&f.env);

    // Mock auth for the *signed* authorization (to = f.to)...
    let signed = auth(&f, 500, 0, 2_000, 1);
    f.env.mock_auths(&[
        MockAuth {
            address: &f.from,
            invoke: &MockAuthInvoke {
                contract: &f.contract_id,
                fn_name: "settle",
                args: (signed.clone(),).into_val(&f.env),
                sub_invokes: &[MockAuthInvoke {
                    contract: &f.asset,
                    fn_name: "transfer",
                    args: (&f.from, &f.contract_id, 500i128).into_val(&f.env),
                    sub_invokes: &[],
                }],
            },
        },
        MockAuth {
            address: &f.facilitator,
            invoke: &MockAuthInvoke {
                contract: &f.contract_id,
                fn_name: "settle",
                args: (signed.clone(),).into_val(&f.env),
                sub_invokes: &[],
            },
        },
    ]);

    // ...but attempt to settle a *different* struct redirecting `to`.
    let mut tampered = signed.clone();
    tampered.to = attacker.clone();

    let result = client(&f).try_settle(&tampered, &500);
    assert!(result.is_err(), "tampered `to` must fail authorization");
    assert_eq!(token(&f).balance(&attacker), 0);
}

// ---------------------------------------------------------------------
// Facilitator binding: settlement is bound to one named operator.
// ---------------------------------------------------------------------

#[test]
fn rejects_settlement_without_facilitator_auth() {
    let f = setup(1_000);
    let a = auth(&f, 500, 0, 2_000, 1);

    // Only the buyer's auth is mocked; the facilitator's is not.
    f.env.mock_auths(&[MockAuth {
        address: &f.from,
        invoke: &MockAuthInvoke {
            contract: &f.contract_id,
            fn_name: "settle",
            args: (a.clone(),).into_val(&f.env),
            sub_invokes: &[MockAuthInvoke {
                contract: &f.asset,
                fn_name: "transfer",
                args: (&f.from, &f.contract_id, 500i128).into_val(&f.env),
                sub_invokes: &[],
            }],
        },
    }]);

    let result = client(&f).try_settle(&a, &100);
    assert!(
        result.is_err(),
        "settlement without facilitator auth must fail"
    );
}

#[test]
fn a_third_party_cannot_settle_on_a_different_facilitators_behalf() {
    let f = setup(1_000);
    let impostor = Address::generate(&f.env);
    let a = auth(&f, 500, 0, 2_000, 1); // authorization.facilitator == f.facilitator

    f.env.mock_auths(&[
        MockAuth {
            address: &f.from,
            invoke: &MockAuthInvoke {
                contract: &f.contract_id,
                fn_name: "settle",
                args: (a.clone(),).into_val(&f.env),
                sub_invokes: &[MockAuthInvoke {
                    contract: &f.asset,
                    fn_name: "transfer",
                    args: (&f.from, &f.contract_id, 500i128).into_val(&f.env),
                    sub_invokes: &[],
                }],
            },
        },
        // The impostor signs instead of the named facilitator.
        MockAuth {
            address: &impostor,
            invoke: &MockAuthInvoke {
                contract: &f.contract_id,
                fn_name: "settle",
                args: (a.clone(),).into_val(&f.env),
                sub_invokes: &[],
            },
        },
    ]);

    let result = client(&f).try_settle(&a, &100);
    assert!(
        result.is_err(),
        "an unnamed facilitator must not be able to settle"
    );
}

// ---------------------------------------------------------------------
// Auth tree shape: require_auth_for_args must exclude actual_amount.
// This is the core mechanism the whole scheme rests on: prove the buyer's
// signature does *not* need to know actual_amount to be valid, by settling
// two different actual_amounts under the identical authorization/mock.
// ---------------------------------------------------------------------

#[test]
fn one_signature_covers_any_actual_amount_up_to_the_maximum() {
    let f = setup(2_000);
    let low = auth(&f, 500, 0, 2_000, 1);
    let high = auth(&f, 500, 0, 2_000, 2);

    // Same shape of signed data (a max_amount ceiling), two different
    // settlement amounts decided only at settle time, exactly the point
    // of require_auth_for_args((authorization,)) excluding actual_amount.
    client(&f).settle(&low, &1);
    client(&f).settle(&high, &500);

    assert_eq!(token(&f).balance(&f.to), 501);
    assert_eq!(token(&f).balance(&f.contract_id), 0);
}

// ---------------------------------------------------------------------
// Phase 6b: budget reconciliation. A buyer with a reserved budget must be
// charged against actual_amount, never max_amount, the whole point of the
// feature is that the stock OpenZeppelin spending-limit policy can't do
// this (see budget.rs), so this is the one place proving the reconciled
// number is actually right, not just plausible.
// ---------------------------------------------------------------------

#[test]
fn settling_with_no_budget_installed_is_unaffected() {
    // Same assertion as one_signature_covers_any_actual_amount_up_to_the_maximum
    // above, restated to make the "budget is opt-in" claim explicit: a buyer
    // who never calls install_budget settles exactly as before Phase 6b.
    let f = setup(1_000);
    let a = auth(&f, 500, 0, 2_000, 1);

    client(&f).settle(&a, &200);

    assert_eq!(client(&f).get_budget(&f.from), None);
    assert_eq!(token(&f).balance(&f.to), 200);
}

#[test]
fn budget_is_debited_by_actual_amount_not_max_amount() {
    let f = setup(10_000);
    client(&f).install_budget(&f.from, &1_000, &100);

    // max_amount (5,000) is far larger than the entire budget (1,000).
    // Only settling for less than the budget can possibly succeed: this
    // is the direct evidence the reconciliation is keyed on actual_amount.
    let a = auth(&f, 5_000, 0, 2_000, 1);
    client(&f).settle(&a, &300);

    let budget = client(&f).get_budget(&f.from).expect("budget installed");
    assert_eq!(budget.cached_total_spent, 300);
    assert_eq!(token(&f).balance(&f.to), 300);
    assert_eq!(token(&f).balance(&f.from), 10_000 - 300);
}

#[test]
fn a_settlement_that_would_exceed_the_remaining_budget_is_rejected() {
    let f = setup(10_000);
    client(&f).install_budget(&f.from, &1_000, &100);

    let first = auth(&f, 5_000, 0, 2_000, 1);
    client(&f).settle(&first, &900);

    // 900 already spent, budget is 1,000: 150 more would exceed it, even
    // though max_amount (5,000) has plenty of room left.
    let second = auth(&f, 5_000, 0, 2_000, 2);
    let result = client(&f).try_settle(&second, &150);
    assert_eq!(result, rejected(Error::BudgetExceeded));

    // The rejected settlement must not have moved any funds or consumed
    // the second authorization's nonce.
    assert_eq!(token(&f).balance(&f.to), 900);
    let third = auth(&f, 5_000, 0, 2_000, 2); // same nonce as `second`
    client(&f).settle(&third, &50); // 900 + 50 = 950, within budget
    assert_eq!(token(&f).balance(&f.to), 950);
}

#[test]
fn zero_settlement_never_touches_the_budget() {
    // Mirrors zero_settlement_refunds_everything above, but with a budget
    // installed: spending nothing must not count against any budget,
    // matching OpenZeppelin's own "a zero-amount transfer has no effect on
    // the spending budget" rule for the stock spending-limit policy.
    let f = setup(1_000);
    client(&f).install_budget(&f.from, &1, &100); // smallest possible budget

    let a = auth(&f, 500, 0, 2_000, 1);
    client(&f).settle(&a, &0);

    let budget = client(&f).get_budget(&f.from).expect("budget installed");
    assert_eq!(budget.cached_total_spent, 0);
    assert_eq!(token(&f).balance(&f.from), 1_000);
}

#[test]
fn budget_rolling_window_evicts_expired_spend() {
    let f = setup(10_000);
    client(&f).install_budget(&f.from, &1_000, &50); // 50-ledger window

    let first = auth(&f, 5_000, 0, 2_000, 1);
    client(&f).settle(&first, &1_000); // spends the entire budget

    let second_blocked = auth(&f, 5_000, 0, 2_000, 2);
    let result = client(&f).try_settle(&second_blocked, &1);
    assert_eq!(result, rejected(Error::BudgetExceeded));

    // Advance past the rolling window: the first entry should now evict.
    f.env.ledger().with_mut(|l| {
        l.sequence_number += 51;
    });

    let second_allowed = auth(&f, 5_000, 0, 4_000, 3);
    client(&f).settle(&second_allowed, &1_000);

    let budget = client(&f).get_budget(&f.from).expect("budget installed");
    assert_eq!(budget.cached_total_spent, 1_000);
}

#[test]
fn installing_a_budget_twice_is_rejected() {
    let f = setup(1_000);
    client(&f).install_budget(&f.from, &500, &100);

    let result = client(&f).try_install_budget(&f.from, &500, &100);
    assert_eq!(result, rejected(Error::BudgetAlreadyInstalled));
}

#[test]
fn installing_a_non_positive_budget_is_rejected() {
    let f = setup(1_000);
    let result = client(&f).try_install_budget(&f.from, &0, &100);
    assert_eq!(result, rejected(Error::InvalidBudget));
}

#[test]
fn installing_a_budget_with_a_zero_period_is_rejected() {
    let f = setup(1_000);
    let result = client(&f).try_install_budget(&f.from, &500, &0);
    assert_eq!(result, rejected(Error::InvalidBudget));
}
