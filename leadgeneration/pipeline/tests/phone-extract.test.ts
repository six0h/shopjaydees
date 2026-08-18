import { describe, it, expect } from "vitest";
import { extractPhones, type ScrapedPage } from "../src/phone-extract.js";

function page(url: string, markdown: string, links: string[] = []): ScrapedPage {
  return { url, markdown, links };
}

describe("extractPhones", () => {
  it("prefers a tel: link for the company phone", () => {
    const r = extractPhones(
      [page("https://marex.com", "Call us today.", ["tel:+16048554214", "tel:+16048551677"])],
      "Brad Lowen"
    );
    expect(r.companyPhone).toBe("(604) 855-4214");
    expect(r.otherPhoneLines).toContain("(604) 855-1677");
  });

  it("falls back to a phone in the markdown when there is no tel: link", () => {
    const r = extractPhones(
      [page("https://x.com", "Phone: 604-617-5578 for a quote.")],
      "Jorge Lizardo"
    );
    expect(r.companyPhone).toBe("(604) 617-5578");
  });

  it("rejects invalid NANP area/exchange codes (leading 0/1, N11)", () => {
    const r = extractPhones(
      [page("https://x.com", "ref 171-500-5147 and 017-577-2165 and 911-900-0000")],
      "Nobody"
    );
    expect(r.companyPhone).toBe("");
  });

  it("does not match a phantom number spanning a doubled, separator-less number", () => {
    // Real case: 'Call us at 833-322-2722833-322-2722' must not yield (322) 272-2833.
    const r = extractPhones(
      [page("https://db.com", "Call us at 833-322-2722833-322-2722", ["tel:+18333222722"])],
      "John Lohan"
    );
    expect(r.companyPhone).toBe("(833) 322-2722");
    expect(r.otherPhoneLines).not.toContain("(322)");
  });

  it("ignores digit runs embedded in image-hash filenames, using the tel: link instead", () => {
    const r = extractPhones(
      [page(
        "https://esc.com",
        "![logo](media/40c927_bd59a2975744489e92545_auto.png)",
        ["tel:(604) 910 - 6266"]
      )],
      "Matt Bellerive"
    );
    expect(r.companyPhone).toBe("(604) 910-6266");
  });

  it("strips a dept/person extension from the company phone", () => {
    const r = extractPhones(
      [page("https://mw.com", "Office: (778) 285-0331 Ext 101")],
      "Chris Lamb"
    );
    expect(r.companyPhone).toBe("(778) 285-0331");
  });

  it("filters other-lines to same-area or toll-free numbers, dropping foreign junk", () => {
    const r = extractPhones(
      [page("https://ml.com", "Main 604-425-3505 alt 604-425-3515 vendor 201-878-8483")],
      "Stirling Robertson"
    );
    expect(r.companyPhone).toBe("(604) 425-3505");
    expect(r.otherPhoneLines).toContain("(604) 425-3515");
    expect(r.otherPhoneLines).not.toContain("(201)");
  });

  it("labels a fax line and keeps it out of the primary", () => {
    const r = extractPhones(
      [page("https://s.com", "Tel: 604-853-2020  Fax: 604-850-5700", ["tel:6048532020"])],
      "Tanner Redekop"
    );
    expect(r.companyPhone).toBe("(604) 853-2020");
    expect(r.otherPhoneLines).toContain("(604) 850-5700 (fax)");
  });

  it("captures a labelled direct/extension only next to the contact's full name", () => {
    const md =
      "Accounts Payable\n\n**Ritu Bala** Accounts Payable Manager\nDirect line: (604) 547-0290\n\n" +
      "**Simone Lamb** Quality Control\nOffice: (778) 285-0331 Ext 102";
    // Chris Lamb is NOT on this page — surname 'Lamb' must not borrow Simone's ext.
    const r = extractPhones([page("https://a1.com", md)], "Chris Lamb");
    expect(r.extension).toBe("");
    expect(r.mobile).toBe("");
  });

  it("extracts a mobile only when explicitly labelled near the full name", () => {
    const md = "**Dana Reid** Owner\nCell: (604) 555-8080";
    const r = extractPhones([page("https://d.com", md)], "Dana Reid");
    expect(r.mobile).toBe("(604) 555-8080");
  });

  it("returns all-empty for an unreachable/empty scrape", () => {
    const r = extractPhones([], "Someone");
    expect(r).toEqual({ companyPhone: "", otherPhoneLines: "", mobile: "", extension: "" });
  });
});
