# Connecting Your Outreach Email Accounts to Instantly — ShopJaydees

The two outreach addresses are ready to go:

- **ellie@shopjaydees.ca**
- **ellie@shopjaydees.net**

The technical email setup (DKIM authentication) is done on both domains. The last step is connecting these two Google Workspace mailboxes to Instantly so it can start "warming them up" — gradually building a sending reputation so your outreach lands in inboxes instead of spam folders.

This takes about 10 minutes. There are two parts: a one-time approval in your Google Admin console, then connecting each mailbox in Instantly.

**Questions at any point?** Email cody@sixohquad.com.

---

## Part 1: Approve Instantly in Google Workspace (one-time)

Google blocks third-party apps from accessing mailboxes until an admin approves them. This step tells Google that Instantly is trusted.

1. Go to [admin.google.com](https://admin.google.com/) and sign in with your Google Workspace **admin** account
2. In the left menu, go to **Security** → **Access and data control** → **API Controls**
3. Click **Manage App Access**
4. Click **Configure new app**
5. In the **Search for app** field, paste this Client ID (searching for "Instantly" by name will *not* work — it must be the ID):

   ```
   536726988839-pt93oro4685dtb1emb0pp2vjgjol5mls.apps.googleusercontent.com
   ```

6. Click **Search** — you should see **Instantly OAuth Email v1** in the results
7. Click it, then:
   - Scope: select **All users**
   - Access type: select **Trusted**
8. Review and click **Finish**

You should now see "Instantly OAuth Email v1" in your list of configured apps.

> **Note:** If the .ca and .net mailboxes live in two separate Google Workspace accounts, repeat these steps in the Admin console for each one.

---

## Part 2: Connect the two mailboxes in Instantly

1. Go to [app.instantly.ai](https://app.instantly.ai/app/accounts) and sign in
2. Click **Email Accounts** in the left sidebar
3. Click **Add New**
4. In the pop-up, select **Connect existing accounts** and choose **Google**
5. Select **Option 1: oAuth**
6. Click **Login**
7. In the Google pop-up, choose **ellie@shopjaydees.ca** — if it isn't listed, click **Use another account** and sign in with that mailbox's credentials
8. Click **Continue**, then **Allow** to grant Instantly access

Then repeat steps 3–8 for **ellie@shopjaydees.net**.

> **Tip:** If the right Google account won't show up in the pop-up, try doing this in an Incognito/private browser window — old login sessions can get in the way.

---

## Part 3: Done — Cody takes it from here

Once both accounts show up in your Instantly Email Accounts list, let Cody know. He'll:

- Enable and configure warmup on both accounts
- Monitor deliverability while the accounts build reputation

Warmup typically runs for **2–3 weeks** before the accounts are ready to send real campaigns. During that time the accounts exchange automated emails with Instantly's network behind the scenes — nothing you need to do.
