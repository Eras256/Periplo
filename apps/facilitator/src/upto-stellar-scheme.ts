/**
 * `UptoStellarScheme`: the facilitator-side implementation of `upto` on
 * Stellar, the `contract` profile
 * ([x402-foundation/x402#3098](https://github.com/x402-foundation/x402/pull/3098),
 * `specs/schemes/upto/scheme_upto_stellar.md` on that PR's branch,
 * `docs/UPTO-CONVERGENCE.md` in this repo for the full story). Wires the
 * already-deployed `UptoSettlement` contract (`contracts/upto-settlement`,
 * Phase 6) into this facilitator's own `/verify`/`/settle` HTTP routes,
 * closing the gap CLAUDE.md/`docs/DEFERRED.md` have tracked open since
 * Phase 6: "the facilitator does not call `UptoSettlement` yet from its
 * own HTTP routes."
 *
 * No published `@x402/stellar` class exists for `upto` (it isn't a wire
 * scheme that package ships), so unlike `exact` this cannot be "don't
 * reimplement, import the real thing" (spec §1). What it *can* be is
 * "share verification code and mechanics with the real, published `exact`
 * facilitator wherever the spec doesn't diverge" (the spec's own Appendix:
 * "Implementations SHOULD share verification code between the two
 * schemes where these do not diverge"). This module follows the real
 * `ExactStellarScheme` facilitator's actual mechanics as closely as the
 * schemes' real differences allow, read directly from the installed
 * `@x402/stellar@2.22.0` package (Apache-2.0, a direct dependency this
 * project already builds on, not a competitor's code), not guessed:
 *
 * - `settle()` reuses the client's already-signed `SorobanAuthorizationEntry`
 *   objects verbatim (`invokeOp.auth`, unmodified), exactly like
 *   `ExactStellarScheme.settle()` does. This is the one part that MUST
 *   work this way, not a stylistic choice: `require_auth_for_args`
 *   commits the buyer's signature to the argument tuple `(authorization,)`
 *   only, independent of the real transaction envelope or of
 *   `actual_amount`, so the signed entries stay valid across a rebuild
 *   that changes both. A signature cannot be "ported" onto a freshly
 *   re-simulated auth entry instead (tried, in an earlier revision of
 *   this file's own design pass): Soroban's own protocol-level nonce and
 *   `signatureExpirationLedger`, both part of what the buyer's signature
 *   actually covers, are chosen fresh by a new simulation, so a
 *   re-simulated entry's preimage is never the one the buyer signed,
 *   even carrying the same `Authorization` struct.
 * - Unlike `exact`, `settle()` cannot reuse the client's own simulation
 *   for `sorobanData`: the call's `actual_amount` genuinely changes
 *   between the client's placeholder value and the facilitator's real
 *   one, and `UptoSettlement.settle()`'s own three-transfer structure
 *   (pull, conditional payout, conditional refund, see
 *   `contracts/upto-settlement/src/lib.rs`) means the ledger-entry
 *   footprint a placeholder amount touches can genuinely differ from
 *   what the real amount touches (e.g. a placeholder that happens to
 *   equal `max_amount` never touches the refund leg's footprint at all).
 *   `settle()` here re-simulates with the real `actual_amount` before
 *   building the final transaction, never reusing a stale footprint,
 *   same "never reuse the client's bid" discipline `docs/DEFERRED.md`
 *   already documents for `exact`'s own fee handling.
 * - Signature-presence checking (not full offline cryptographic
 *   verification) mirrors what the real, published `ExactStellarScheme`
 *   itself actually does: it also only checks presence
 *   (`gatherAuthEntrySignatureStatus`, an internal `@x402/stellar`
 *   helper, not re-derivable from outside the package, achieves the
 *   same structural check `inspectAuthEntry` provides here, both stop
 *   short of full offline signature verification). The spec's own
 *   warning that "simulation is not authorization verification" is real,
 *   but a forged signature that passes this structural check still fails
 *   for real at actual submission (the network verifies every signature
 *   when applying the transaction, not just when simulating it), so no
 *   funds are ever at risk from the gap; matching the shipped reference
 *   implementation's actual rigor was chosen over inventing a stricter,
 *   untested mechanism of this module's own.
 */

import {
  Address,
  BASE_FEE,
  inspectAuthEntry,
  nativeToScVal,
  Operation,
  scValToNative,
  Transaction,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { Api, type Server as RpcServer } from "@stellar/stellar-sdk/rpc";
import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import {
  type FacilitatorStellarSigner,
  getEstimatedLedgerCloseTimeSeconds,
  getNetworkPassphrase,
  getRpcClient,
  isStellarNetwork,
} from "@x402/stellar";

const SUPPORTED_X402_VERSION = 2;
const DEFAULT_TIMEOUT_SECONDS = 60;
// upto's own three-transfer structure (pull, conditional payout,
// conditional refund) costs more than exact's single transfer, so the
// default ceiling starts above exact's real deployed value (200_000,
// itself raised from the library default 50_000 for real testnet
// Soroban fee conditions, see CLAUDE.md's Architecture section) rather
// than reusing it unexamined.
const DEFAULT_MAX_TRANSACTION_FEE_STROOPS = 300_000;
const SIGNATURE_EXPIRATION_LEDGER_TOLERANCE = 2;

export type UptoAuthorization = {
  from: string;
  to: string;
  asset: string;
  max_amount: bigint;
  valid_after_ledger: number;
  deadline_ledger: number;
  nonce: Buffer;
  facilitator: string;
};

function invalidVerifyResponse(reason: string, payer?: string, message?: string): VerifyResponse {
  return {
    isValid: false,
    invalidReason: reason,
    ...(payer !== undefined ? { payer } : {}),
    ...(message !== undefined ? { invalidMessage: message } : {}),
  };
}
function validVerifyResponse(payer: string): VerifyResponse {
  return { isValid: true, payer };
}
function failedSettleResponse(
  network: Network,
  errorReason: string,
  payer: string | undefined,
  transaction = ""
): SettleResponse {
  return {
    success: false,
    network,
    transaction,
    errorReason,
    ...(payer !== undefined ? { payer } : {}),
  };
}

const roundRobinSelectSigner = (): ((addrs: readonly string[]) => string) => {
  let index = 0;
  return (addrs) => {
    const addr = addrs[index % addrs.length];
    index++;
    if (!addr) throw new Error("No signer addresses configured");
    return addr;
  };
};

type InternalVerifyResult = {
  response: VerifyResponse;
  /** Present only when `response.isValid`. */
  simResponse?: Api.SimulateTransactionSuccessResponse;
  transaction?: Transaction;
  invokeOp?: Transaction["operations"][number] & { auth?: xdr.SorobanAuthorizationEntry[] };
  authorization?: UptoAuthorization;
  authScVal?: xdr.ScVal;
};

export type UptoStellarSchemeOptions = {
  readonly rpcConfig?: { readonly url?: string };
  /** Safety ceiling in stroops; verify/settle reject if the simulation-derived fee exceeds this (default: 300_000). */
  readonly maxTransactionFeeStroops?: number;
  readonly selectSigner?: (addresses: readonly string[]) => string;
};

/**
 * Stellar facilitator implementation for the `upto` payment scheme,
 * `contract` profile. One instance is bound to one `UptoSettlement`
 * deployment address per network (`settlementContracts`), matching the
 * spec's `extra.settlementContract` being "the canonical `UptoSettlement`
 * deployment address for the selected `uptoProfile` on this network."
 */
export class UptoStellarScheme {
  readonly scheme = "upto";
  readonly caipFamily = "stellar:*";
  private readonly signerMap: Map<string, FacilitatorStellarSigner>;
  private readonly signingAddresses: ReadonlySet<string>;
  private readonly settlementContracts: Partial<Record<Network, string>>;
  private readonly rpcConfig?: { readonly url?: string };
  private readonly maxTransactionFeeStroops: number;
  private readonly selectSigner: (addresses: readonly string[]) => string;

  constructor(
    signers: FacilitatorStellarSigner[],
    settlementContracts: Partial<Record<Network, string>>,
    options: UptoStellarSchemeOptions = {}
  ) {
    if (!signers || signers.length === 0) {
      throw new Error("At least one signer is required");
    }
    this.signerMap = new Map(signers.map((s) => [s.address, s]));
    this.signingAddresses = new Set(this.signerMap.keys());
    this.settlementContracts = settlementContracts;
    if (options.rpcConfig !== undefined) this.rpcConfig = options.rpcConfig;
    this.maxTransactionFeeStroops =
      options.maxTransactionFeeStroops ?? DEFAULT_MAX_TRANSACTION_FEE_STROOPS;
    this.selectSigner = options.selectSigner ?? roundRobinSelectSigner();
  }

  getExtra(network: Network): Record<string, unknown> | undefined {
    const settlementContract = this.settlementContracts[network];
    if (!settlementContract) return undefined;
    return { areFeesSponsored: true, uptoProfile: "contract", settlementContract };
  }

  getSigners(_network: string): string[] {
    return [...this.signingAddresses];
  }

  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<VerifyResponse> {
    return (await this._verify(payload, requirements, "verify")).response;
  }

  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<SettleResponse> {
    const server = getRpcClient(requirements.network as Network, this.rpcConfig);
    const networkPassphrase = getNetworkPassphrase(requirements.network as Network);
    let payer: string | undefined;
    let txHash: string | undefined;
    try {
      const verifyResult = await this._verify(payload, requirements, "settle");
      if (!verifyResult.response.isValid) {
        return failedSettleResponse(
          payload.accepted.network,
          verifyResult.response.invalidReason ?? "verification_failed",
          verifyResult.response.payer
        );
      }
      payer = verifyResult.response.payer;
      const { invokeOp, authScVal } = verifyResult;
      const settlementContract = this.settlementContracts[requirements.network as Network];
      if (!invokeOp || !authScVal || !settlementContract) {
        return failedSettleResponse(payload.accepted.network, "unexpected_settle_error", payer);
      }

      const actualAmount = BigInt(requirements.amount);

      const signerAddress = this.selectSigner([...this.signingAddresses]);
      const signer = this.signerMap.get(signerAddress);
      if (!signer) {
        return failedSettleResponse(
          payload.accepted.network,
          "settle_upto_stellar_signer_selection_failed",
          payer
        );
      }

      const buyerAuthEntry = (invokeOp.auth ?? []).find((entry) => {
        const credentials = entry.credentials();
        if (credentials.switch().name !== "sorobanCredentialsAddress") return false;
        return payer !== undefined
          ? Address.fromScAddress(credentials.address().address()).toString() === payer
          : false;
      });
      if (!buyerAuthEntry) {
        // Unreachable: _verify already confirmed this entry exists
        // before returning a valid response. Guarded for the type
        // checker, not a real runtime path.
        return failedSettleResponse(payload.accepted.network, "unexpected_settle_error", payer);
      }

      // Never reuses _verify's own trial simulation (which may have
      // picked a different signer via round-robin, and in any case ran
      // before the account below was fetched fresh): re-simulates with
      // THIS signer as source and the REAL actual_amount, matching the
      // "never reuse a stale footprint or a stale bid" discipline this
      // module's own doc comment already states for `exact`.
      const facilitatorAccount = await server.getAccount(signer.address);
      const rebuild = await this.simulateFacilitatorRebuild(
        server,
        networkPassphrase,
        settlementContract,
        authScVal,
        buyerAuthEntry,
        actualAmount,
        facilitatorAccount,
        requirements.maxTimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS
      );
      if (!rebuild.ok) {
        console.error("Settle-time simulation error:", rebuild.error);
        return failedSettleResponse(
          payload.accepted.network,
          "invalid_upto_stellar_payload_simulation_failed",
          payer
        );
      }
      const { op: newOp, simResponse } = rebuild;
      const minResourceFee = Number.parseInt(simResponse.minResourceFee, 10);
      const settlementFeeStroops = minResourceFee + Number.parseInt(BASE_FEE, 10);
      if (settlementFeeStroops > this.maxTransactionFeeStroops) {
        return failedSettleResponse(
          payload.accepted.network,
          "invalid_upto_stellar_payload_fee_exceeds_maximum",
          payer
        );
      }

      // Re-fetch the account: `simulateFacilitatorRebuild` doesn't
      // consume a real sequence number, but building against a stale
      // `Account` object risks a mismatch if anything else touched this
      // signer's sequence in the meantime. Cheap, and matches the "never
      // trust a stale read for something about to submit a real
      // transaction" discipline the rest of this facilitator uses.
      const freshFacilitatorAccount = await server.getAccount(signer.address);
      const finalTx = new TransactionBuilder(freshFacilitatorAccount, {
        fee: settlementFeeStroops.toString(),
        networkPassphrase,
        sorobanData: simResponse.transactionData.build(),
      })
        .setTimeout(requirements.maxTimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS)
        .addOperation(newOp)
        .build();

      const { signedTxXdr, error: signError } = await signer.signTransaction(finalTx.toXDR(), {
        networkPassphrase,
      });
      if (signError || !signedTxXdr) {
        return failedSettleResponse(
          payload.accepted.network,
          "settle_upto_stellar_transaction_signing_failed",
          payer
        );
      }

      const txToSubmit = TransactionBuilder.fromXDR(signedTxXdr, networkPassphrase) as Transaction;
      const sendResult = await server.sendTransaction(txToSubmit);
      if (sendResult.status !== "PENDING") {
        return failedSettleResponse(
          payload.accepted.network,
          "settle_upto_stellar_transaction_submission_failed",
          payer
        );
      }
      txHash = sendResult.hash;
      const maxPollAttempts = requirements.maxTimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
      const confirmResult = await this.pollForTransaction(server, txHash, maxPollAttempts);
      if (!confirmResult.success) {
        return failedSettleResponse(
          payload.accepted.network,
          "settle_upto_stellar_transaction_failed",
          payer,
          txHash
        );
      }

      return {
        success: true,
        transaction: txHash,
        network: payload.accepted.network,
        ...(payer !== undefined ? { payer } : {}),
        amount: actualAmount.toString(),
      };
    } catch (error) {
      console.error("Unexpected upto settlement error:", error);
      return failedSettleResponse(
        payload.accepted.network,
        "unexpected_settle_error",
        payer,
        txHash || ""
      );
    }
  }

  /**
   * Builds a `settle(authorization, amount)` invocation sourced by a
   * facilitator account, simulates it, and returns the operation with
   * the CORRECT complete auth array: the buyer's real, already-signed
   * entry (reused verbatim) plus whatever else this rebuild's own
   * simulation determines is needed, in practice the facilitator's own
   * `sourceAccount`-type entry for its `require_auth()`
   * (`authorization.facilitator`), auto-satisfied by being the
   * transaction's source, structurally present but carrying no
   * signature.
   *
   * Two simulation passes, not one, and the reason is load-bearing, not
   * caution for its own sake: `@stellar/stellar-sdk`'s own
   * `assembleTransaction` helper documents (in its own source comment)
   * that a NON-empty `auth` array on the operation being simulated is
   * treated as "already complete" and evaluated as-is, not merged with
   * what the simulator would otherwise discover. Pre-supplying just the
   * buyer's entry and expecting the simulator to fill in the
   * facilitator's own missing one produced a real
   * `Error(Auth, InvalidAction)` / "Unauthorized function call" failure
   * when this was tried first, run for real, not reasoned about in
   * advance. The first pass here always uses an EMPTY auth array purely
   * to discover the complete requirement set; the second pass simulates
   * the real, final operation (buyer's real signature swapped in) to get
   * an accurate resource footprint and fee for what will actually be
   * submitted.
   */
  private async simulateFacilitatorRebuild(
    server: RpcServer,
    networkPassphrase: string,
    settlementContract: string,
    authScVal: xdr.ScVal,
    buyerAuthEntry: xdr.SorobanAuthorizationEntry,
    amount: bigint,
    facilitatorAccount: InstanceType<typeof import("@stellar/stellar-sdk").Account>,
    maxTimeoutSeconds: number
  ): Promise<
    | {
        ok: true;
        op: ReturnType<typeof Operation.invokeContractFunction>;
        simResponse: Api.SimulateTransactionSuccessResponse;
      }
    | { ok: false; error: string }
  > {
    const amountScVal = nativeToScVal(amount, { type: "i128" });

    const discoveryOp = Operation.invokeContractFunction({
      contract: settlementContract,
      function: "settle",
      args: [authScVal, amountScVal],
    });
    const discoveryTx = new TransactionBuilder(facilitatorAccount, {
      fee: BASE_FEE,
      networkPassphrase,
    })
      .setTimeout(maxTimeoutSeconds)
      .addOperation(discoveryOp)
      .build();
    const discoverySim = await server.simulateTransaction(discoveryTx);
    if (!Api.isSimulationSuccess(discoverySim)) {
      return { ok: false, error: discoverySim.error ?? "discovery simulation failed" };
    }

    const buyerAddress = Address.fromScAddress(
      buyerAuthEntry.credentials().address().address()
    ).toString();
    const discoveredAuth = discoverySim.result?.auth ?? [];
    const finalAuth = [
      buyerAuthEntry,
      ...discoveredAuth.filter((entry) => {
        const credentials = entry.credentials();
        // Keep anything that isn't an address-credential (e.g. the
        // facilitator's own sourceAccount-type entry) as discovered.
        if (credentials.switch().name !== "sorobanCredentialsAddress") return true;
        return Address.fromScAddress(credentials.address().address()).toString() !== buyerAddress;
      }),
    ];

    const finalOp = Operation.invokeContractFunction({
      contract: settlementContract,
      function: "settle",
      args: [authScVal, amountScVal],
      auth: finalAuth,
    });
    const finalTx = new TransactionBuilder(facilitatorAccount, {
      fee: BASE_FEE,
      networkPassphrase,
    })
      .setTimeout(maxTimeoutSeconds)
      .addOperation(finalOp)
      .build();
    const finalSim = await server.simulateTransaction(finalTx);
    if (!Api.isSimulationSuccess(finalSim)) {
      return { ok: false, error: finalSim.error ?? "final simulation failed" };
    }

    return { ok: true, op: finalOp, simResponse: finalSim };
  }

  private async pollForTransaction(
    server: RpcServer,
    hash: string,
    maxPollAttempts = 15,
    delayMs = 1000
  ): Promise<{ success: boolean }> {
    for (let i = 0; i < maxPollAttempts; i++) {
      try {
        const txResult = await server.getTransaction(hash);
        if (txResult.status === "SUCCESS") return { success: true };
        if (txResult.status === "FAILED") return { success: false };
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } catch (error) {
        if (error instanceof Error && !error.message.includes("NOT_FOUND")) {
          console.warn(`Poll attempt ${i} failed:`, error);
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return { success: false };
  }

  private async _verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    phase: "verify" | "settle"
  ): Promise<InternalVerifyResult> {
    let fromAddress: string | undefined;
    try {
      if (payload.x402Version !== SUPPORTED_X402_VERSION) {
        return { response: invalidVerifyResponse("invalid_x402_version") };
      }
      if (payload.accepted.scheme !== "upto" || requirements.scheme !== "upto") {
        return { response: invalidVerifyResponse("unsupported_scheme") };
      }
      if (requirements.network !== payload.accepted.network) {
        return { response: invalidVerifyResponse("network_mismatch") };
      }
      if (!isStellarNetwork(requirements.network as Network)) {
        return { response: invalidVerifyResponse("invalid_network") };
      }
      const network = requirements.network as Network;
      const settlementContract = this.settlementContracts[network];
      if (!settlementContract) {
        return { response: invalidVerifyResponse("upto_not_supported_on_network") };
      }
      const payloadProfile = (payload.accepted.extra as Record<string, unknown> | undefined)
        ?.uptoProfile;
      const requirementsProfile = (requirements.extra as Record<string, unknown> | undefined)
        ?.uptoProfile;
      if (payloadProfile !== "contract" || requirementsProfile !== "contract") {
        return { response: invalidVerifyResponse("invalid_upto_profile") };
      }
      const requirementsContract = (requirements.extra as Record<string, unknown> | undefined)
        ?.settlementContract;
      if (requirementsContract !== settlementContract) {
        return {
          response: invalidVerifyResponse("invalid_upto_stellar_wrong_settlement_contract"),
        };
      }

      const networkPassphrase = getNetworkPassphrase(network);
      const server = getRpcClient(network, this.rpcConfig);
      const stellarPayload = payload.payload as { transaction?: unknown };
      if (!stellarPayload || typeof stellarPayload.transaction !== "string") {
        return { response: invalidVerifyResponse("invalid_upto_stellar_payload_malformed") };
      }

      let transaction: Transaction;
      try {
        transaction = new Transaction(stellarPayload.transaction, networkPassphrase);
      } catch (error) {
        console.error("Error parsing upto transaction:", error);
        return { response: invalidVerifyResponse("invalid_upto_stellar_payload_malformed") };
      }
      if (transaction.operations.length !== 1) {
        return { response: invalidVerifyResponse("invalid_upto_stellar_payload_wrong_operation") };
      }
      const operation = transaction.operations[0];
      if (operation?.type !== "invokeHostFunction") {
        return { response: invalidVerifyResponse("invalid_upto_stellar_payload_wrong_operation") };
      }
      // Rule 4 (facilitator safety): the client-supplied tx/op source must
      // never be this facilitator.
      if (
        this.signingAddresses.has((operation as { source?: string }).source ?? "") ||
        this.signingAddresses.has(transaction.source)
      ) {
        return {
          response: invalidVerifyResponse("invalid_upto_stellar_payload_unsafe_tx_or_op_source"),
        };
      }

      const invokeOp = operation as typeof operation & { auth?: xdr.SorobanAuthorizationEntry[] };
      const func = (invokeOp as unknown as { func?: xdr.HostFunction }).func;
      if (func?.switch().name !== "hostFunctionTypeInvokeContract") {
        return { response: invalidVerifyResponse("invalid_upto_stellar_payload_wrong_operation") };
      }
      const invokeContractArgs = func.invokeContract();
      const contractAddress = Address.fromScAddress(
        invokeContractArgs.contractAddress()
      ).toString();
      const functionName = invokeContractArgs.functionName().toString();
      const args = invokeContractArgs.args();
      if (contractAddress !== settlementContract) {
        return { response: invalidVerifyResponse("invalid_upto_stellar_payload_wrong_contract") };
      }
      if (functionName !== "settle" || args.length !== 2) {
        return {
          response: invalidVerifyResponse("invalid_upto_stellar_payload_wrong_function_name"),
        };
      }
      const authScVal = args[0];
      if (!authScVal) {
        return { response: invalidVerifyResponse("invalid_upto_stellar_payload_malformed") };
      }

      let authorization: UptoAuthorization;
      try {
        authorization = scValToNative(authScVal) as UptoAuthorization;
      } catch (error) {
        console.error("Error decoding upto authorization:", error);
        return { response: invalidVerifyResponse("invalid_upto_stellar_payload_malformed") };
      }
      fromAddress = authorization.from;

      if (this.signingAddresses.has(fromAddress)) {
        return {
          response: invalidVerifyResponse("invalid_upto_stellar_payload_facilitator_is_payer"),
        };
      }
      if (authorization.to !== requirements.payTo) {
        return {
          response: invalidVerifyResponse(
            "invalid_upto_stellar_payload_wrong_recipient",
            fromAddress
          ),
        };
      }
      if (authorization.asset !== requirements.asset) {
        return {
          response: invalidVerifyResponse("invalid_upto_stellar_payload_wrong_asset", fromAddress),
        };
      }
      if (!this.signingAddresses.has(authorization.facilitator)) {
        return {
          response: invalidVerifyResponse(
            "invalid_upto_stellar_payload_wrong_facilitator",
            fromAddress
          ),
        };
      }

      const requirementsAmount = BigInt(requirements.amount);
      if (phase === "verify") {
        // Verify-phase: requirements.amount carries the maximum.
        if (authorization.max_amount !== requirementsAmount) {
          return {
            response: invalidVerifyResponse(
              "invalid_upto_stellar_payload_wrong_max_amount",
              fromAddress
            ),
          };
        }
      } else {
        // Settle-phase: requirements.amount carries the actual charge,
        // which may be less than (never more than) the signed ceiling.
        // The equality check above applies only at /verify.
        if (requirementsAmount < 0n || requirementsAmount > authorization.max_amount) {
          return {
            response: invalidVerifyResponse(
              "invalid_upto_stellar_payload_settlement_exceeds_amount",
              fromAddress
            ),
          };
        }
      }

      const latestLedger = await server.getLatestLedger();
      const currentLedger = latestLedger.sequence;
      if (currentLedger < authorization.valid_after_ledger) {
        return {
          response: invalidVerifyResponse(
            "invalid_upto_stellar_payload_not_yet_valid",
            fromAddress
          ),
        };
      }
      if (currentLedger > authorization.deadline_ledger) {
        return {
          response: invalidVerifyResponse("invalid_upto_stellar_payload_expired", fromAddress),
        };
      }
      const maxTimeoutSeconds = requirements.maxTimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
      const estimatedLedgerSeconds = await getEstimatedLedgerCloseTimeSeconds(network);
      const maxLedgerOffset = Math.ceil(maxTimeoutSeconds / estimatedLedgerSeconds);
      const maxLedger = currentLedger + maxLedgerOffset;
      if (authorization.deadline_ledger > maxLedger + SIGNATURE_EXPIRATION_LEDGER_TOLERANCE) {
        return {
          response: invalidVerifyResponse("invalid_upto_stellar_window_too_long", fromAddress),
        };
      }

      // Structural checks first, before spending an RPC round-trip on
      // simulation: rejects a malformed auth-entry tree outright, and
      // gives us the buyer's own already-signed entry to reuse below.
      const authValidation = this.validateAuthEntries(
        invokeOp,
        fromAddress,
        authorization,
        settlementContract,
        requirements.asset
      );
      if (authValidation) {
        return { response: authValidation };
      }
      const buyerAuthEntry = (invokeOp.auth ?? []).find((entry) => {
        const credentials = entry.credentials();
        if (credentials.switch().name !== "sorobanCredentialsAddress") return false;
        return Address.fromScAddress(credentials.address().address()).toString() === fromAddress;
      });
      if (!buyerAuthEntry) {
        // Unreachable given validateAuthEntries already confirmed a
        // signed entry for fromAddress exists; guarded for the type
        // checker, not a real runtime path.
        return {
          response: invalidVerifyResponse(
            "invalid_upto_stellar_payload_missing_payer_signature",
            fromAddress
          ),
        };
      }

      // Simulate a FACILITATOR-sourced rebuild, not the client's raw
      // transaction as-is: `authorization.facilitator.require_auth()`
      // can only be satisfied by the transaction whose source account IS
      // the facilitator (no separate signed entry needed for it, by
      // design, see this module's own doc comment and
      // `simulateFacilitatorRebuild`'s), so simulating the client's
      // payload directly always fails on that check alone, regardless of
      // whether the buyer's own part is valid. Confirmed by actually
      // running this against a real testnet simulation
      // (`Error(Auth, InvalidAction)`, "Unauthorized function call for
      // address <facilitator>"), not reasoned about in advance. Using
      // `requirements.amount` for the trial's `actual_amount` argument
      // is correct at both phases: at /verify it's the maximum (a full
      // settlement is what's being validated as possible), at /settle
      // it's the real charge, exactly matching what `settle()` itself
      // submits.
      const trialSignerAddress = this.selectSigner([...this.signingAddresses]);
      const trialFacilitatorAccount = await server.getAccount(trialSignerAddress);
      const rebuild = await this.simulateFacilitatorRebuild(
        server,
        networkPassphrase,
        settlementContract,
        authScVal,
        buyerAuthEntry,
        requirementsAmount,
        trialFacilitatorAccount,
        maxTimeoutSeconds
      );
      if (!rebuild.ok) {
        console.error("Upto simulation error:", rebuild.error);
        return {
          response: invalidVerifyResponse(
            "invalid_upto_stellar_payload_simulation_failed",
            fromAddress
          ),
        };
      }
      const { simResponse } = rebuild;
      if (phase === "verify") {
        const minResourceFee = Number.parseInt(simResponse.minResourceFee, 10);
        const settlementFeeStroops = minResourceFee + Number.parseInt(BASE_FEE, 10);
        if (settlementFeeStroops > this.maxTransactionFeeStroops) {
          return {
            response: invalidVerifyResponse(
              "invalid_upto_stellar_payload_fee_exceeds_maximum",
              fromAddress,
              `simulation-derived fee ${settlementFeeStroops} stroops exceeds ceiling ${this.maxTransactionFeeStroops} stroops`
            ),
          };
        }
      }

      return {
        response: validVerifyResponse(fromAddress),
        simResponse,
        transaction,
        invokeOp,
        authorization,
        authScVal,
      };
    } catch (error) {
      console.error("Unexpected upto verification error:", error);
      return { response: invalidVerifyResponse("unexpected_verify_error", fromAddress) };
    }
  }

  /**
   * Rule 3 (Authorization entries) from the spec. Only the buyer's entry
   * is expected to be present in the client's payload: the facilitator's
   * own `require_auth()` is satisfied later, at settlement, by the
   * facilitator being the submitting transaction's own source account
   * (no separate signed entry needed, confirmed live against a real
   * testnet simulation, see `docs/DEFERRED.md`'s Phase 6 section), so an
   * entry for the facilitator appearing here at all is rejected as unsafe
   * (mirrors `exact`'s own `invalid_exact_stellar_payload_facilitator_in_auth`).
   */
  private validateAuthEntries(
    invokeOp: { auth?: xdr.SorobanAuthorizationEntry[] },
    fromAddress: string,
    authorization: UptoAuthorization,
    settlementContract: string,
    expectedAsset: string
  ): VerifyResponse | undefined {
    if (!invokeOp.auth || invokeOp.auth.length === 0) {
      return invalidVerifyResponse("invalid_upto_stellar_payload_no_auth_entries", fromAddress);
    }
    let buyerEntrySigned = false;
    for (const auth of invokeOp.auth) {
      const credentialsType = auth.credentials().switch();
      if (credentialsType !== xdr.SorobanCredentialsType.sorobanCredentialsAddress()) {
        return invalidVerifyResponse(
          "invalid_upto_stellar_payload_unsupported_credential_type",
          fromAddress
        );
      }
      const addressCredentials = auth.credentials().address();
      const authAddress = Address.fromScAddress(addressCredentials.address()).toString();
      if (this.signingAddresses.has(authAddress)) {
        return invalidVerifyResponse(
          "invalid_upto_stellar_payload_facilitator_in_auth",
          fromAddress
        );
      }
      if (authAddress !== fromAddress) {
        return invalidVerifyResponse("invalid_upto_stellar_payload_unexpected_signer", fromAddress);
      }

      const rootInvocation = auth.rootInvocation();
      const rootFn = rootInvocation.function().contractFn();
      // The authorized tuple MUST be exactly (authorization,): argCount 1.
      // An entry whose root args also cover actual_amount (argCount 2)
      // means the client fixed the charge itself and MUST be rejected
      // (spec, Facilitator verification rules, rule 3).
      if (rootFn.args().length !== 1) {
        return invalidVerifyResponse(
          "invalid_upto_stellar_payload_auth_covers_actual_amount",
          fromAddress
        );
      }
      const subInvocations = rootInvocation.subInvocations();
      if (subInvocations.length !== 1) {
        return invalidVerifyResponse(
          "invalid_upto_stellar_payload_wrong_subinvocation_count",
          fromAddress
        );
      }
      const sub = subInvocations[0];
      if (!sub) {
        return invalidVerifyResponse(
          "invalid_upto_stellar_payload_wrong_subinvocation_count",
          fromAddress
        );
      }
      const subFn = sub.function().contractFn();
      const subContract = Address.fromScAddress(subFn.contractAddress()).toString();
      const subFunctionName = subFn.functionName().toString();
      const subArgs = subFn.args();
      if (subContract !== expectedAsset || subFunctionName !== "transfer" || subArgs.length !== 3) {
        return invalidVerifyResponse(
          "invalid_upto_stellar_payload_wrong_subinvocation",
          fromAddress
        );
      }
      const subFrom = scValToNative(subArgs[0] as xdr.ScVal);
      const subTo = scValToNative(subArgs[1] as xdr.ScVal);
      const subAmount = scValToNative(subArgs[2] as xdr.ScVal) as bigint;
      if (
        subFrom !== fromAddress ||
        subTo !== settlementContract ||
        subAmount !== authorization.max_amount
      ) {
        return invalidVerifyResponse(
          "invalid_upto_stellar_payload_wrong_subinvocation_args",
          fromAddress
        );
      }

      const info = inspectAuthEntry(auth);
      if (info.signed) buyerEntrySigned = true;
    }
    if (!buyerEntrySigned) {
      return invalidVerifyResponse(
        "invalid_upto_stellar_payload_missing_payer_signature",
        fromAddress
      );
    }
    return undefined;
  }
}
