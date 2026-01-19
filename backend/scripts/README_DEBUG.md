# Email Poller Debugging Guide

If emails aren't showing up in your inbox after sending a reply from the vendor email, follow these debugging steps:

## Quick Debug Steps

### 1. Run the Debug Script

The debug script will check all emails from the last 24 hours and tell you why they're not being processed:

```bash
cd backend
npx tsx scripts/debugEmailPoller.ts
```

This will show you:
- All emails from the last 24 hours
- Whether each email is UNSEEN (unread) or READ
- Whether the subject contains required keywords
- Whether the sender is a known vendor
- Whether an RFP can be matched

### 2. Check Common Issues

The email poller **only processes emails that meet ALL of these criteria:**

1. ✅ **Email is UNSEEN (unread)** - If your email client marked it as read, it won't be processed
2. ✅ **Subject contains "rfp", "proposal", or "quote"** (case-insensitive)
3. ✅ **Sender email matches a vendor in the database**
4. ✅ **An RFP with status "sent" exists** to match the email to

### 3. Manual Trigger

You can manually trigger the email poller without waiting 5 minutes:

```bash
curl -X POST http://localhost:3001/api/mail/poll
```

Or use the browser console:
```javascript
fetch('http://localhost:3001/api/mail/poll', { method: 'POST' })
  .then(r => r.json())
  .then(console.log);
```

### 4. Check Server Logs

The enhanced email poller now logs detailed information:

```
[Email Poller] Processing email: Subject="...", From="..."
[Email Poller] Skipping email: Subject doesn't contain 'rfp', 'proposal', or 'quote'
[Email Poller] Skipping email: Sender email@example.com is not a known vendor
[Email Poller] Skipping email: No matching RFP found for subject "..."
[Email Poller] Processed proposal from Vendor Name for RFP Title
```

## Common Fixes

### Email is marked as READ
**Fix:** Mark the email as unread in your email client, then manually trigger the poller.

### Subject doesn't have keywords
**Fix:** Reply with a subject that includes "RFP", "Proposal", or "Quote". The poller checks the subject line.

### Sender not a known vendor
**Fix:** Make sure the vendor email address in your database matches exactly the sender's email. Check:
```bash
# Check vendors in database
curl http://localhost:3001/api/vendors
```

### No matching RFP found
**Fix:** Make sure you've sent an RFP (status should be "sent"). Check:
```bash
# Check RFPs
curl http://localhost:3001/api/rfps
```

## Enhanced Logging

The email poller now logs:
- When it starts checking emails
- Each email being processed
- Why emails are skipped
- When proposals are successfully created

Check your backend server console output to see these logs.

## Testing

To test if everything works:

1. Send an RFP to a vendor (status becomes "sent")
2. Reply from the vendor email with:
   - Subject containing "RFP", "Proposal", or "Quote"
   - Make sure the email is UNREAD
   - Use the exact vendor email from your database
3. Manually trigger the poller: `POST /api/mail/poll`
4. Check the inbox: The proposal should appear

## Still Not Working?

1. Verify IMAP credentials in `.env`:
   - `IMAP_USER`
   - `IMAP_PASSWORD`
   - `IMAP_HOST` (default: imap.gmail.com)
   - `IMAP_PORT` (default: 993)

2. Check database connection and tables exist

3. Run the debug script to see exact details about your emails
