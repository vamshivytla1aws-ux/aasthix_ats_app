import { describe, expect, it } from "vitest";
import { applyPrimaryDomainGate, evaluatePrimaryDomainGate } from "@/lib/singleMatch/domainGate";

const dynamicsJob = {
  jobTitle: "Microsoft Dynamics 365 CRM Consultant",
  jobDescription: "Configure and customize Microsoft Dynamics 365 CRM. Dynamics 365 implementation experience is mandatory.",
  mustHave: ["Microsoft Dynamics 365 CRM"],
};

describe("strict primary-domain matching gate", () => {
  it("caps basics-only Dynamics exposure at 49", () => {
    const gate = evaluatePrimaryDomainGate({ ...dynamicsJob, resumeText: "Basic knowledge of Microsoft Dynamics 365 CRM from training." });
    expect(gate?.evidence_depth).toBe("basics");
    expect(applyPrimaryDomainGate(69, gate)).toBe(49);
  });

  it("rejects candidates with no primary-domain evidence", () => {
    const gate = evaluatePrimaryDomainGate({ ...dynamicsJob, resumeText: "Backend engineer building Node.js APIs." });
    expect(gate?.evidence_depth).toBe("none");
    expect(applyPrimaryDomainGate(80, gate)).toBe(39);
  });

  it("does not cap proven hands-on delivery", () => {
    const gate = evaluatePrimaryDomainGate({ ...dynamicsJob, resumeText: "Implemented and customized Microsoft Dynamics 365 CRM workflows for a production client migration." });
    expect(gate?.evidence_depth).toBe("hands_on");
    expect(applyPrimaryDomainGate(86, gate)).toBe(86);
  });
});
