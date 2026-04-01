import { describe, expect, it } from "vitest";
import { quickScore } from "@/lib/matchJobs/quickScore";

describe("quickScore", () => {
  it("returns 0–100", () => {
    const jd = "Need SQL analytics marketing insights stakeholder management";
    const s = quickScore(jd, {
      skills: "SQL, Tableau, marketing analytics",
      experience_summary: "5 years in analytics",
      resume_text: "Campaign performance and SQL",
      skillset: ["SQL", "Tableau"],
      full_name: "A",
      location: "Remote",
    });
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });

  it("ranks stronger overlap higher", () => {
    const jd = "SQL python tableau marketing analytics";
    const weak = quickScore(jd, {
      skills: "cashier",
      experience_summary: "",
      resume_text: null,
      skillset: [],
      full_name: "W",
    });
    const strong = quickScore(jd, {
      skills: "SQL Python Tableau marketing analytics",
      experience_summary: "8 years",
      resume_text: "SQL and marketing analytics dashboards",
      skillset: ["SQL"],
      full_name: "S",
    });
    expect(strong).toBeGreaterThan(weak);
  });
});
