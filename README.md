<<<<<<< HEAD
# webShare (Offline LAN)

Share **text** and **files** between devices on the same **Wi‑Fi/LAN** without internet.

## How to run
1. Open terminal in this folder:
   - `c:/Users/webShare`
2. Install dependencies:
   - `npm install`
3. Start server:
   - `npm start`

4. From the server terminal output, copy the LAN URL (or open the share page in the browser and click **Get LAN link**).
5. On another device connected to the same Wi‑Fi/LAN, open the shown receiver URL.

## Notes
- Works offline **as long as all devices are on the same local network**.
- File uploads use multipart form upload.

## Troubleshooting
- If other devices can’t connect:
  - ensure they are on the same Wi‑Fi network/subnet
  - check firewall permissions for Node.js / port `3210`

=======
# PC-to-PC-Share
A lightweight, zero-internet local network file and text sharing tool built with Node.js for rapid cross-device transfers over Wi-Fi and mobile hotspots.
>>>>>>> 578106798ba4e2f61bc4e45ec9502c629e89d13e
