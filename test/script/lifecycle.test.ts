import { describe, expect, it } from "vitest";

import {
  approvalOf,
  cancelRx,
  cancelRxResponse,
  parseScript,
  rxChangeRequest,
  rxChangeResponse,
  rxRenewalRequest,
  rxRenewalResponse,
  SCRIPT_WARNING_CODES,
  type ResponseOutcome,
} from "../../src/index.js";
import { loadScriptFixture } from "../_helpers/load-fixture.js";

describe("parseScript — lifecycle requests", () => {
  it("reads an RxRenewalRequest with patient, pharmacy, prescriber, and medication", () => {
    const msg = parseScript(loadScriptFixture("rxrenewal-request.xml"));

    expect(msg.body.kind).toBe("RxRenewalRequest");
    const body = rxRenewalRequest(msg);
    expect(body?.requestReferenceNumber).toBe("SYNTH-REF-0201");
    expect(body?.patient?.name?.lastName).toBe("Testpatient");
    expect(body?.pharmacy?.identification?.npi).toBe("1999999999");
    expect(body?.prescriber?.identification?.npi).toBe("1888888888");
    expect(body?.medicationPrescribed?.description).toBe("Atorvastatin 20 MG Oral Tablet");

    // A request has no response disposition and is reachable via the request accessor only.
    expect(msg.disposition).toBeUndefined();
    expect(msg.asLifecycleRequest()).toBe(body);
    expect(msg.asLifecycleResponse()).toBeUndefined();
    expect(rxRenewalResponse(msg)).toBeUndefined();
  });

  it("reads an RxChangeRequest", () => {
    const msg = parseScript(loadScriptFixture("rxchange-request.xml"));
    expect(msg.body.kind).toBe("RxChangeRequest");
    const body = rxChangeRequest(msg);
    expect(body?.requestReferenceNumber).toBe("SYNTH-REF-0301");
    expect(body?.medicationPrescribed?.description).toBe("Atorvastatin 20 MG Oral Tablet");
    expect(msg.asLifecycleRequest()?.kind).toBe("RxChangeRequest");
  });

  it("reads a CancelRx", () => {
    const msg = parseScript(loadScriptFixture("cancelrx-request.xml"));
    expect(msg.body.kind).toBe("CancelRx");
    const body = cancelRx(msg);
    expect(body?.requestReferenceNumber).toBe("SYNTH-REF-0401");
    expect(body?.prescriber?.identification?.npi).toBe("1888888888");
    expect(msg.asLifecycleRequest()?.kind).toBe("CancelRx");
  });
});

describe("parseScript — RxRenewalResponse outcomes", () => {
  it("reads an Approved renewal and exposes the affirmed medication", () => {
    const msg = parseScript(loadScriptFixture("rxrenewal-response-approved.xml"));
    expect(msg.body.kind).toBe("RxRenewalResponse");
    const body = rxRenewalResponse(msg);
    expect(body).toBeDefined();
    if (body === undefined) return;
    expect(body.outcome).toBe("approved");
    expect(approvalOf(body.outcome)).toBe("affirmative");
    expect(body.requestReferenceNumber).toBe("SYNTH-REF-0201");
    expect(body.medicationPrescribed?.description).toBe("Atorvastatin 20 MG Oral Tablet");
    expect(msg.correlatesTo).toBe("SYNTH-MSG-0201");
  });

  it("ApprovedWithChanges preserves the *changed* medication (must dispense the change)", () => {
    const msg = parseScript(loadScriptFixture("rxrenewal-response-approved-with-changes.xml"));
    const body = rxRenewalResponse(msg);
    expect(body).toBeDefined();
    if (body === undefined) return;
    expect(body.outcome).toBe("approvedWithChanges");
    expect(approvalOf(body.outcome)).toBe("affirmative");
    // The changed medication — not the originally requested 20 MG — is what surfaces.
    expect(body.medicationPrescribed?.description).toBe("Atorvastatin 40 MG Oral Tablet");
    expect(body.medicationPrescribed?.coded?.productCode?.value).toBe("00000000002");
  });

  it("ApprovedWithChanges surfaces a changed medication nested inside the outcome element", () => {
    const msg = parseScript(
      loadScriptFixture("rxrenewal-response-approved-with-changes-nested.xml"),
    );
    const body = rxRenewalResponse(msg);
    expect(body).toBeDefined();
    if (body === undefined) return;
    expect(body.outcome).toBe("approvedWithChanges");
    // The med lives under <ApprovedWithChanges>, not as a sibling of <Response>;
    // it must still surface so a consumer dispenses the change, not the original.
    expect(body.medicationPrescribed?.description).toBe("Atorvastatin 80 MG Oral Tablet");
    expect(body.medicationPrescribed?.coded?.productCode?.value).toBe("00000000003");
  });

  it("a Denied renewal never reads as approved and carries its reason verbatim", () => {
    const msg = parseScript(loadScriptFixture("rxrenewal-response-denied.xml"));
    const body = rxRenewalResponse(msg);
    expect(body).toBeDefined();
    if (body === undefined) return;
    expect(body.outcome).toBe("denied");
    expect(approvalOf(body.outcome)).toBe("negative");
    expect(approvalOf(body.outcome)).not.toBe("affirmative");
    expect(body.reason?.code).toBe("AT");
    expect(body.reason?.denialReason).toBe("Patient is no longer under this prescriber's care.");
    // No medication is dispensed on a denial.
    expect(body.medicationPrescribed).toBeUndefined();
  });
});

describe("parseScript — RxChangeResponse outcomes", () => {
  it("reads a Validated change as indeterminate (neither approval nor denial)", () => {
    const msg = parseScript(loadScriptFixture("rxchange-response-validated.xml"));
    const body = rxChangeResponse(msg);
    expect(body).toBeDefined();
    if (body === undefined) return;
    expect(body.outcome).toBe("validated");
    expect(approvalOf(body.outcome)).toBe("indeterminate");
    expect(body.medicationPrescribed?.description).toBe("Atorvastatin 20 MG Oral Tablet");
  });

  it("a Denied change never reads as approved", () => {
    const msg = parseScript(loadScriptFixture("rxchange-response-denied.xml"));
    const body = rxChangeResponse(msg);
    expect(body).toBeDefined();
    if (body === undefined) return;
    expect(body.outcome).toBe("denied");
    expect(approvalOf(body.outcome)).toBe("negative");
    expect(body.reason?.code).toBe("DG");
  });
});

describe("parseScript — CancelRxResponse outcomes", () => {
  it("reads an Approved cancellation", () => {
    const msg = parseScript(loadScriptFixture("cancelrx-response-approved.xml"));
    const body = cancelRxResponse(msg);
    expect(body).toBeDefined();
    if (body === undefined) return;
    expect(body.outcome).toBe("approved");
    expect(approvalOf(body.outcome)).toBe("affirmative");
    expect(msg.correlatesTo).toBe("SYNTH-MSG-0401");
  });

  it("a Denied cancellation never reads as approved", () => {
    const msg = parseScript(loadScriptFixture("cancelrx-response-denied.xml"));
    const body = cancelRxResponse(msg);
    expect(body).toBeDefined();
    if (body === undefined) return;
    expect(body.outcome).toBe("denied");
    expect(approvalOf(body.outcome)).toBe("negative");
    expect(body.reason?.code).toBe("AA");
  });
});

describe("parseScript — lifecycle outcome fail-safe behavior", () => {
  it("when both an approval and a denial are present, the denial wins and warns", () => {
    const msg = parseScript(loadScriptFixture("rxrenewal-response-ambiguous.xml"));
    const body = rxRenewalResponse(msg);
    expect(body).toBeDefined();
    if (body === undefined) return;
    expect(body.outcome).toBe("denied");
    expect(approvalOf(body.outcome)).toBe("negative");
    expect(msg.warnings.map((w) => w.code)).toContain(
      SCRIPT_WARNING_CODES.LIFECYCLE_AMBIGUOUS_OUTCOME,
    );
  });

  it("a response with no recognized outcome is unknown (never approved) and warns", () => {
    const msg = parseScript(loadScriptFixture("rxrenewal-response-no-outcome.xml"));
    const body = rxRenewalResponse(msg);
    expect(body).toBeDefined();
    if (body === undefined) return;
    expect(body.outcome).toBe("unknown");
    expect(approvalOf(body.outcome)).toBe("indeterminate");
    expect(approvalOf(body.outcome)).not.toBe("affirmative");
    expect(msg.warnings.map((w) => w.code)).toContain(
      SCRIPT_WARNING_CODES.LIFECYCLE_OUTCOME_UNRECOGNIZED,
    );
  });
});

describe("approvalOf — fail-safe classification is total and one-directional", () => {
  it("maps every outcome; only an outright approval is affirmative", () => {
    const mapping: Record<ResponseOutcome, ReturnType<typeof approvalOf>> = {
      approved: "affirmative",
      approvedWithChanges: "affirmative",
      denied: "negative",
      deniedNewToFollow: "negative",
      replace: "indeterminate",
      validated: "indeterminate",
      unknown: "indeterminate",
    };
    for (const [outcome, expected] of Object.entries(mapping) as [
      ResponseOutcome,
      ReturnType<typeof approvalOf>,
    ][]) {
      expect(approvalOf(outcome)).toBe(expected);
    }
  });
});

describe("lifecycle accessors are one-directional (never cross request/response)", () => {
  it("a response is not reachable through any request accessor, and vice-versa", () => {
    const response = parseScript(loadScriptFixture("rxrenewal-response-approved.xml"));
    expect(rxRenewalRequest(response)).toBeUndefined();
    expect(rxChangeRequest(response)).toBeUndefined();
    expect(cancelRx(response)).toBeUndefined();
    expect(rxChangeResponse(response)).toBeUndefined();
    expect(cancelRxResponse(response)).toBeUndefined();
    expect(response.asLifecycleRequest()).toBeUndefined();

    const request = parseScript(loadScriptFixture("rxrenewal-request.xml"));
    expect(rxRenewalResponse(request)).toBeUndefined();
    expect(rxChangeResponse(request)).toBeUndefined();
    expect(cancelRxResponse(request)).toBeUndefined();
    expect(request.asLifecycleResponse()).toBeUndefined();
  });

  it("neither lifecycle accessor reads a NewRx or a response-spine transaction", () => {
    const newRx = parseScript(loadScriptFixture("newrx-basic.xml"));
    expect(newRx.asLifecycleRequest()).toBeUndefined();
    expect(newRx.asLifecycleResponse()).toBeUndefined();

    const status = parseScript(loadScriptFixture("status-response.xml"));
    expect(status.asLifecycleRequest()).toBeUndefined();
    expect(status.asLifecycleResponse()).toBeUndefined();
  });
});

describe("lifecycle response tolerates a missing <Response> wrapper", () => {
  it("detects a bare outcome child directly under the response transaction", () => {
    const raw =
      '<Message version="2017071"><Body><RxRenewalResponse><Approved/></RxRenewalResponse></Body></Message>';
    const body = rxRenewalResponse(parseScript(raw));
    expect(body?.outcome).toBe("approved");
    // A bare <Approved/> carries no reason.
    expect(body?.reason).toBeUndefined();
  });
});

describe("lifecycle warnings carry XPath context, never field values (PHI-safe)", () => {
  it("ambiguous/unknown warnings expose only an XPath path with no reason codes", () => {
    for (const fixture of [
      "rxrenewal-response-ambiguous.xml",
      "rxrenewal-response-no-outcome.xml",
    ]) {
      const msg = parseScript(loadScriptFixture(fixture));
      for (const w of msg.warnings) {
        expect(w.position.path.startsWith("/")).toBe(true);
        const haystack = `${w.message} ${w.position.path}`;
        expect(haystack).not.toContain("AT");
        expect(haystack).not.toContain("Testpatient");
      }
    }
  });
});
