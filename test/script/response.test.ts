import { describe, expect, it } from "vitest";

import {
  parseScript,
  status,
  error,
  verify,
  newRx,
  dispositionOf,
  SCRIPT_WARNING_CODES,
} from "../../src/index.js";
import { loadScriptFixture } from "../_helpers/load-fixture.js";

describe("parseScript — Status (positive acknowledgment)", () => {
  it("reads Code / DescriptionCode / Description verbatim and dispositions success", () => {
    const msg = parseScript(loadScriptFixture("status-response.xml"));

    expect(msg.body.kind).toBe("Status");
    expect(msg.disposition).toBe("success");

    const body = status(msg);
    expect(body?.code).toBe("010");
    expect(body?.descriptionCode).toBe("000");
    expect(body?.description).toBe("Transaction received and queued for processing.");

    expect(error(msg)).toBeUndefined();
    expect(verify(msg)).toBeUndefined();
    expect(newRx(msg)).toBeUndefined();
    expect(msg.warnings).toHaveLength(0);
  });

  it("correlates to the request via RelatesToMessageID", () => {
    const msg = parseScript(loadScriptFixture("status-response.xml"));
    expect(msg.correlatesTo).toBe("SYNTH-MSG-0001");
    expect(msg.header.relatesToMessageId).toBe("SYNTH-MSG-0001");
  });
});

describe("parseScript — Error (negative acknowledgment)", () => {
  it("reads the error code and description verbatim and dispositions error, never success", () => {
    const msg = parseScript(loadScriptFixture("error-response.xml"));

    expect(msg.body.kind).toBe("Error");
    expect(msg.disposition).toBe("error");
    expect(msg.disposition).not.toBe("success");

    const body = error(msg);
    expect(body?.code).toBe("900");
    expect(body?.descriptionCode).toBe("090");
    expect(body?.description).toBe("Prescriber identifier could not be validated by the receiver.");

    // An Error is never readable as a Status.
    expect(status(msg)).toBeUndefined();
    expect(msg.correlatesTo).toBe("SYNTH-MSG-0002");
  });
});

describe("parseScript — Verify (verification acknowledgment)", () => {
  it("reads the verify body and dispositions verify", () => {
    const msg = parseScript(loadScriptFixture("verify-response.xml"));

    expect(msg.body.kind).toBe("Verify");
    expect(msg.disposition).toBe("verify");

    const body = verify(msg);
    expect(body?.code).toBe("010");
    expect(body?.description).toBe("Prescriber confirmed review of the referenced transaction.");
    expect(msg.correlatesTo).toBe("SYNTH-MSG-0003");
  });
});

describe("parseScript — response fail-safe behavior", () => {
  it("reports Error (not Status) and warns when both are present (never masks a failure)", () => {
    const msg = parseScript(loadScriptFixture("response-ambiguous.xml"));

    expect(msg.body.kind).toBe("Error");
    expect(msg.disposition).toBe("error");
    expect(status(msg)).toBeUndefined();
    expect(error(msg)?.code).toBe("900");

    expect(msg.warnings.map((w) => w.code)).toContain(
      SCRIPT_WARNING_CODES.RESPONSE_AMBIGUOUS_DISPOSITION,
    );
  });

  it("warns MISSING_REQUIRED_ELEMENT but still surfaces the disposition when Code is absent", () => {
    const msg = parseScript(loadScriptFixture("status-no-code.xml"));

    expect(msg.body.kind).toBe("Status");
    expect(msg.disposition).toBe("success");
    expect(status(msg)?.code).toBeUndefined();
    expect(status(msg)?.description).toBe("Acknowledged without a status code.");

    expect(msg.warnings.map((w) => w.code)).toContain(
      SCRIPT_WARNING_CODES.MISSING_REQUIRED_ELEMENT,
    );
  });

  it("a non-response, non-NewRx transaction stays unsupported with no disposition", () => {
    const msg = parseScript(loadScriptFixture("unsupported-transaction.xml"));
    expect(msg.body.kind).toBe("unsupported");
    expect(msg.disposition).toBeUndefined();
    expect(status(msg)).toBeUndefined();
    expect(error(msg)).toBeUndefined();
  });

  it("a lifecycle request transaction is not a response and has no disposition", () => {
    const msg = parseScript(loadScriptFixture("rxrenewal-request.xml"));
    expect(msg.body.kind).toBe("RxRenewalRequest");
    expect(msg.disposition).toBeUndefined();
    expect(status(msg)).toBeUndefined();
    expect(error(msg)).toBeUndefined();
  });
});

describe("dispositionOf", () => {
  it("maps each response kind one-directionally", () => {
    expect(dispositionOf("Status")).toBe("success");
    expect(dispositionOf("Error")).toBe("error");
    expect(dispositionOf("Verify")).toBe("verify");
  });
});

describe("response warnings carry XPath context, never field values (PHI-safe)", () => {
  it("ambiguous-disposition warning position is an XPath path with no codes/descriptions", () => {
    const msg = parseScript(loadScriptFixture("response-ambiguous.xml"));
    for (const w of msg.warnings) {
      expect(w.position.path.startsWith("/")).toBe(true);
      const haystack = `${w.message} ${w.position.path}`;
      expect(haystack).not.toContain("Downstream rejection");
      expect(haystack).not.toContain("900");
    }
  });
});
