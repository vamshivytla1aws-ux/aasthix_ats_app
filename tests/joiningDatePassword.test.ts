import { expect, it } from "vitest";
import { passwordFromJoiningDate } from "@/lib/hrms/joiningDatePassword";
it.each([["1990-05-09", "09051990"], ["2000-02-29", "29022000"], ["1995-01-01", "01011995"]])("formats %s as an eight-digit joining date password", (dob, password) => {
  expect(passwordFromJoiningDate(dob)).toBe(password);
});
it.each(["1990-02-29", "1990-02-30", "1990-13-01", "1990-00-01", "1990-01-00", "1990-5-9", "09051990", "1899-01-01", "", null])("rejects invalid joining date %s", dob => {
  expect(() => passwordFromJoiningDate(dob)).toThrow();
});
it("allows a future joining date for planned onboarding", () => {
  expect(passwordFromJoiningDate("2027-01-05")).toBe("05012027");
});
