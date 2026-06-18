# Connecting Your Outreach Aliases to Instantly (IMAP/SMTP) — ShopJaydees

Two outreach addresses are ready to connect:

- **ellie@shopjaydees.ca**
- **ellie@shopjaydees.net**

Both of these are **aliases** of your main mailbox, **hello@shopjaydees.com**. An alias doesn't have its own password or inbox — any email sent to it simply lands in your `hello@` inbox. So we connect them a little differently than a normal account: we sign Instantly in to your **main mailbox** (`hello@`), and then tell it to **send as** each alias.

This is completely doable and takes about **15 minutes**. There are three parts:

1. A one-time security step in Google to create an **App Password**.
2. Connecting **ellie@shopjaydees.ca** in Instantly.
3. Connecting **ellie@shopjaydees.net** the exact same way.

**Questions at any point?** Email cody@sixohquad.com.

---

## Part 1: Create a Google App Password (one-time)

Because your mailbox uses 2-Step Verification, Instantly can't sign in with your normal password — it needs a special **App Password**. You only need to make **one**; it works for both aliases.

1. Sign in to **hello@shopjaydees.com** at [myaccount.google.com](https://myaccount.google.com).
2. If 2-Step Verification isn't already on, turn it on first: **Security** → **2-Step Verification** → **Get Started**, and follow the prompts (you'll confirm a code sent to your phone).
3. Open the App Passwords page directly at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) — or type **"App passwords"** into the search bar at the top of your Google Account.
4. In the **App name** box, type `Instantly`, then click **Create**.
5. Google shows a **16-character password**. **Copy it now** and keep it handy for Part 2 — you won't be able to see it again after you close the window. (The spaces don't matter.)

> **Note:** You don't need to turn IMAP on anywhere — Google leaves it on by default for all Workspace mailboxes. The App Password is the only thing you need from this step.

---

## Part 2: Connect ellie@shopjaydees.ca in Instantly

1. Go to [app.instantly.ai](https://app.instantly.ai/app/accounts) and sign in.
2. Click **Email Accounts** in the left sidebar.
3. Click **Add New**.
4. In the pop-up, choose **Connect existing accounts**, then select **Any provider (IMAP/SMTP)**.
   *(Not the "Google" option — we use IMAP/SMTP because we sign in as `hello@` but send as the alias.)*
5. Fill in the form exactly as below:

   | Field | What to enter |
   |---|---|
   | **Email** (the address you send from) | `ellie@shopjaydees.ca` |
   | **First name** *(optional)* | `Ellie` |
   | **IMAP username** | `hello@shopjaydees.com` ← your main mailbox, **not** the alias |
   | **IMAP password** | the App Password from Part 1 |
   | **IMAP host** | `imap.gmail.com` |
   | **IMAP port** | `993` |
   | **SMTP username** | `hello@shopjaydees.com` |
   | **SMTP password** | the App Password from Part 1 |
   | **SMTP host** | `smtp.gmail.com` |
   | **SMTP port** | `465` |

6. Click **Connect** (or **Save**). A green check or "connected" status means it worked.

> **The key idea:** the **Email** field is the alias you want to send *from* (`ellie@shopjaydees.ca`), but the **username** for both IMAP and SMTP is always your real mailbox login (`hello@shopjaydees.com`). That pairing is what lets the alias send and receive correctly.

> **If it won't connect:** re-check that the App Password was copied with no typos, that the username is `hello@shopjaydees.com` on **both** the IMAP and SMTP rows, and — if `465` is rejected — try SMTP port **`587`** instead.

---

## Part 3: Connect ellie@shopjaydees.net

Repeat **all of Part 2**, changing only the **Email** field to:

- **Email:** `ellie@shopjaydees.net`

Everything else stays identical — same `hello@shopjaydees.com` username, the same App Password, and the same hosts and ports.

---

## Part 4: Done — Cody takes it from here

Once both addresses show as **connected** in your Instantly Email Accounts list, let Cody know. He'll:

- Enable and configure **warmup** on both addresses
- Monitor deliverability while they build sending reputation

Warmup typically runs **2–3 weeks** before the addresses are ready for real campaigns. During that time they exchange automated emails behind the scenes — nothing you need to do.

---

## Settings at a glance

| | IMAP (receiving) | SMTP (sending) |
|---|---|---|
| **Username** | hello@shopjaydees.com | hello@shopjaydees.com |
| **Password** | your Google App Password | your Google App Password |
| **Host** | imap.gmail.com | smtp.gmail.com |
| **Port** | 993 | 465 (or 587) |
| **Send-from address** | — | ellie@shopjaydees.ca / .net |

**Questions at any point?** Email cody@sixohquad.com.
