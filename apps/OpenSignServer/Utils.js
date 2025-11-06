import dotenv from 'dotenv';
import { format, toZonedTime } from 'date-fns-tz';
import { getSignedLocalUrl } from './cloud/parsefunction/getSignedUrl.js';
import { PDFDocument } from 'pdf-lib';
import crypto from 'node:crypto';
import axios from 'axios';
dotenv.config();

export const cloudServerUrl = 'http://localhost:8080/app';
export const serverAppId = process.env.APP_ID || 'opensign';
export const appName = 'OpenSign™';

export const MAX_NAME_LENGTH = 250;
export const MAX_NOTE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 500;
export const color = [
  '#93a3db',
  '#e6c3db',
  '#c0e3bc',
  '#bce3db',
  '#b8ccdb',
  '#ceb8db',
  '#ffccff',
  '#99ffcc',
  '#cc99ff',
  '#ffcc99',
  '#66ccff',
  '#ffffcc',
];

export function replaceMailVaribles(subject, body, variables) {
  let replacedSubject = subject;
  let replacedBody = body;

  for (const variable in variables) {
    const regex = new RegExp(`{{${variable}}}`, 'g');
    if (subject) {
      replacedSubject = replacedSubject.replace(regex, variables[variable]);
    }
    if (body) {
      replacedBody = replacedBody.replace(regex, variables[variable]);
    }
  }
  const result = { subject: replacedSubject, body: replacedBody };
  return result;
}

export const saveFileUsage = async (size, fileUrl, userId) => {
  //checking server url and save file's size
  try {
    if (userId) {
      const tenantQuery = new Parse.Query('partners_Tenant');
      tenantQuery.equalTo('UserId', {
        __type: 'Pointer',
        className: '_User',
        objectId: userId,
      });
      const tenant = await tenantQuery.first({ useMasterKey: true });
      if (tenant) {
        const tenantPtr = { __type: 'Pointer', className: 'partners_Tenant', objectId: tenant.id };
        try {
          const tenantCredits = new Parse.Query('partners_TenantCredits');
          tenantCredits.equalTo('PartnersTenant', tenantPtr);
          const res = await tenantCredits.first({ useMasterKey: true });
          if (res) {
            const response = JSON.parse(JSON.stringify(res));
            const usedStorage = response?.usedStorage ? response.usedStorage + size : size;
            const updateCredit = new Parse.Object('partners_TenantCredits');
            updateCredit.id = res.id;
            updateCredit.set('usedStorage', usedStorage);
            await updateCredit.save(null, { useMasterKey: true });
          } else {
            const newCredit = new Parse.Object('partners_TenantCredits');
            newCredit.set('usedStorage', size);
            newCredit.set('PartnersTenant', tenantPtr);
            await newCredit.save(null, { useMasterKey: true });
          }
        } catch (err) {
          console.log('err in save usage', err);
        }
        saveDataFile(size, fileUrl, tenantPtr);
      }
    }
  } catch (err) {
    console.log('err in fetch tenant Id', err);
  }
};

//function for save fileUrl and file size in particular client db class partners_DataFiles
const saveDataFile = async (size, fileUrl, tenantPtr) => {
  try {
    const newDataFiles = new Parse.Object('partners_DataFiles');
    newDataFiles.set('FileUrl', fileUrl);
    newDataFiles.set('FileSize', size);
    newDataFiles.set('TenantPtr', tenantPtr);
    await newDataFiles.save(null, { useMasterKey: true });
  } catch (err) {
    console.log('error in save usage ', err);
  }
};

export const updateMailCount = async (extUserId, plan, monthchange) => {
  // Update count in contracts_Users class
  const query = new Parse.Query('contracts_Users');
  query.equalTo('objectId', extUserId);

  try {
    const contractUser = await query.first({ useMasterKey: true });
    if (contractUser) {
      const _extRes = JSON.parse(JSON.stringify(contractUser));
      let updateDate = new Date();
      if (_extRes?.LastEmailCountReset?.iso) {
        updateDate = new Date(_extRes?.LastEmailCountReset?.iso);
        const newDate = new Date();
        // Update the month while keeping the same day and year
        updateDate.setMonth(newDate.getMonth());
        updateDate.setFullYear(newDate.getFullYear());
      }
      contractUser.increment('EmailCount', 1);
      if (plan === 'freeplan') {
        if (monthchange) {
          contractUser.set('LastEmailCountReset', updateDate);
          contractUser.set('MonthlyFreeEmails', 1);
        } else {
          if (contractUser?.get('MonthlyFreeEmails')) {
            contractUser.increment('MonthlyFreeEmails', 1);
            if (contractUser?.get('LastEmailCountReset')) {
              contractUser.set('LastEmailCountReset', updateDate);
            }
          } else {
            contractUser.set('MonthlyFreeEmails', 1);
            contractUser.set('LastEmailCountReset', updateDate);
          }
        }
      }
      await contractUser.save(null, { useMasterKey: true });
    }
  } catch (error) {
    console.log('Error updating EmailCount in contracts_Users: ' + error.message);
  }
};

export function sanitizeFileName(fileName) {
  // Remove spaces and invalid characters
  const file = fileName.replace(/[^a-zA-Z0-9._-]/g, '');
  const removedot = file.replace(/\.(?=.*\.)/g, '');
  return removedot.replace(/[^a-zA-Z0-9._-]/g, '');
}

export const useLocal = process.env.USE_LOCAL ? process.env.USE_LOCAL.toLowerCase() : 'false';
export const smtpsecure = process.env.SMTP_PORT && process.env.SMTP_PORT !== '465' ? false : true;
export const smtpenable =
  process.env.SMTP_ENABLE && process.env.SMTP_ENABLE.toLowerCase() === 'true' ? true : false;
export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// `generateId` is used to unique Id for fileAdapter
export function generateId(length) {
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

// Format date and time for the selected timezone
export const formatTimeInTimezone = (date, timezone) => {
  const nyDate = timezone && toZonedTime(date, timezone);
  const generatedDate = timezone
    ? format(nyDate, 'EEE, dd MMM yyyy HH:mm:ss zzz', { timeZone: timezone })
    : new Date(date).toUTCString();
  return generatedDate;
};

// `getSecureUrl` is used to return local secure url if local files
export const getSecureUrl = url => {
  const fileUrl = new URL(url)?.pathname?.includes('files');
  if (fileUrl) {
    try {
      const file = getSignedLocalUrl(url);
      if (file) {
        return { url: file };
      } else {
        return { url: '' };
      }
    } catch (err) {
      console.log('err while fileupload ', err);
      return { url: '' };
    }
  } else {
    return { url: url };
  }
};

/**
 * FlattenPdf is used to remove existing widgets if present any and flatten pdf.
 * @param {string | Uint8Array | ArrayBuffer} pdfFile - pdf file.
 * @returns {Promise<Uint8Array>} flatPdf - pdf file in unit8arry
 */
export const flattenPdf = async pdfFile => {
  try {
    const pdfDoc = await PDFDocument.load(pdfFile);
    // Get the form
    const form = pdfDoc.getForm();
    // fetch form fields
    const fields = form.getFields();
    // remove form all existing fields and their widgets
    if (fields && fields?.length > 0) {
      try {
        for (const field of fields) {
          while (field.acroField.getWidgets().length) {
            field.acroField.removeWidget(0);
          }
          form.removeField(field);
        }
      } catch (err) {
        console.log('err while removing field from pdf', err);
      }
    }
    // Updates the field appearances to ensure visual changes are reflected.
    form.updateFieldAppearances();
    // Flattens the form, converting all form fields into non-editable, static content
    form.flatten();
    const flatPdf = await pdfDoc.save({ useObjectStreams: false });
    return flatPdf;
  } catch (err) {
    throw new Error('error in pdf');
  }
};

export const mailTemplate = async param => {
  const themeColor = '#264996';
  const subject = `${param.senderName} has requested you to sign "${param.title}"`;

  // Get SecureVerify gate URL if feature is enabled
  let finalSigningUrl = param.signingUrl;

  if (process.env.SECUREVERIFY_ENABLED === 'true') {
    try {
      // Call SecureVerify API to generate gate URL
      const response = await axios.post(
        `${process.env.SECUREVERIFY_API_URL}/verification-gate/generate`,
        {
          recipientEmail: param.recipientEmail,
          recipientName: param.recipientName,
          docId: param.docId,
          contactBookId: param.contactBookId,
          redirectUrl: param.signingUrl,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.SECUREVERIFY_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      finalSigningUrl = response.data.gateUrl;
    } catch (err) {
      console.log('Error generating SecureVerify gate URL, using direct link:', err);
      // Fallback to direct signing URL if SecureVerify is unavailable
    }
  }

  const AppName = 'VeroFi';
  const base = (process.env.APP_URL || 'http://localhost:8080').replace(/\/$/, '');
  const logo = `<img src="${base}/favicon.png" height="50" alt="SignIt" />`;

  const body = `
    <html>
    <head>
      <meta http-equiv='Content-Type' content='text/html;charset=UTF-8' />
      <style>
        body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:0;background:#f3f2ef}
        .email-container{max-width:680px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 6px 20px rgba(0,0,0,.08)}
        .banner{background:${themeColor};padding:22px 26px}
        .brand{display:flex;align-items:center;gap:12px}
        .brand img{height:40px}
        .title{font-size:22px;line-height:1.25;color:#fff;font-weight:800;margin-top:10px}
        .shell{background:#fff}
        .body-wrap{padding:26px}
        .lead{font-size:15px;line-height:22px;color:#262626;margin:0 0 12px 0}
        .sub{font-size:14px;line-height:21px;color:#626363;margin:0 0 18px 0}
        .details{background:#faf9f7;border:1px solid #eee;border-radius:12px;padding:14px 18px}
        .details table{width:100%;border-collapse:collapse}
        .details td{padding:7px 0;vertical-align:top}
        .details td.key{width:160px;font-weight:700;color:#1a1a1a;font-size:14px}
        .details td.val{font-weight:700;color:#626363;font-size:14px}
        .cta-wrap{text-align:center;padding:22px 0 8px}
        .cta{display:inline-block;padding:12px 18px;background:#f5c06a;color:#fff;text-decoration:none;border-radius:10px;font-weight:800;font-size:14px}
        .info{margin-top:12px;background:#eef5fb;border-radius:12px;padding:12px 18px;color:#334}
        .info-row{display:flex;gap:8px;align-items:flex-start;font-size:13px;line-height:20px}
        .footer{padding:18px 26px 26px;color:#6b6b6b;font-size:12px;line-height:18px;text-align:center}
      </style>
    </head>
    <body>
      <div class="email-container">
        <div class="shell">
          <!-- Header banner -->
          <div class="banner">
            <div class="brand">
              ${logo}
            </div>
            <div class="title">Digital Signature Request</div>
          </div>

          <!-- Body -->
          <div class="body-wrap">
            <p class="lead">
              ${param.senderName} has requested you to review and sign <strong>${param.title}</strong>.
            </p>
            <p class="sub">
              Before signing, you'll need to verify your identity with VeroFi.
            </p>

            <!-- Details panel -->
            <div class="details">
              <table role="presentation">
                <tr>
                  <td class="key">Sender</td>
                  <td class="val">${param.senderMail}</td>
                </tr>
                <tr>
                  <td class="key">Organization</td>
                  <td class="val">${param.organization}</td>
                </tr>
                <tr>
                  <td class="key">Expires on</td>
                  <td class="val">${param.localExpireDate}</td>
                </tr>
                <tr>
                  <td class="key">Note</td>
                  <td class="val">${param.note}</td>
                </tr>
              </table>
            </div>

            <!-- CTA -->
            <div class="cta-wrap">
              <a class="cta" target="_blank" href="${finalSigningUrl}">
                Verify &amp; Sign Document
              </a>
            </div>

            <!-- Soft info panel -->
            <div class="info">
              <div class="info-row">🔒
                <span>Before signing, you'll need to verify your identity with VeroFi.</span>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="footer">
            This is an automated email from SignIt. For any queries regarding this email, please contact the sender ${param.senderMail} directly.
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  return { subject, body };
};

export const selectFormat = data => {
  switch (data) {
    case 'L':
      return 'MM/dd/yyyy';
    case 'MM/DD/YYYY':
      return 'MM/dd/yyyy';
    case 'DD-MM-YYYY':
      return 'dd-MM-yyyy';
    case 'DD/MM/YYYY':
      return 'dd/MM/yyyy';
    case 'LL':
      return 'MMMM dd, yyyy';
    case 'DD MMM, YYYY':
      return 'dd MMM, yyyy';
    case 'YYYY-MM-DD':
      return 'yyyy-MM-dd';
    case 'MM-DD-YYYY':
      return 'MM-dd-yyyy';
    case 'MM.DD.YYYY':
      return 'MM.dd.yyyy';
    case 'MMM DD, YYYY':
      return 'MMM dd, yyyy';
    case 'MMMM DD, YYYY':
      return 'MMMM dd, yyyy';
    case 'DD MMMM, YYYY':
      return 'dd MMMM, yyyy';
    case 'DD.MM.YYYY':
      return 'dd.MM.yyyy';
    default:
      return 'MM/dd/yyyy';
  }
};

export function formatDateTime(date, dateFormat, timeZone, is12Hour) {
  const zonedDate = toZonedTime(date, timeZone); // Convert date to the given timezone
  const timeFormat = is12Hour ? 'hh:mm:ss a' : 'HH:mm:ss';
  return dateFormat
    ? format(zonedDate, `${selectFormat(dateFormat)}, ${timeFormat} 'GMT' XXX`, { timeZone })
    : formatTimeInTimezone(date, timeZone);
}

// Utility: Convert base64 to buffer
export const base64ToBuffer = base64 => Buffer.from(base64, 'base64');

// Utility: Generate SHA-256 hash from PDF page metadata
const getPdfMetadataHash = async pdfBytes => {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const metaString = pdfDoc
    .getPages()
    .map((page, index) => {
      const { width, height } = page.getSize();
      return `${index + 1}:${Math.round(width)}x${Math.round(height)}`;
    })
    .join('|');

  return crypto.createHash('sha256').update(metaString).digest('hex');
};
// Utility: Validate if uploaded file matches original template PDF
export const handleReplaceFileValidation = async (baseFileUrl, newFileBase64) => {
  try {
    const { data } = await axios.get(baseFileUrl, { responseType: 'arraybuffer' });
    const basePdfBytes = Buffer.from(data);
    const uploadedPdfBytes = base64ToBuffer(newFileBase64);

    const baseHash = await getPdfMetadataHash(basePdfBytes);
    const uploadedHash = await getPdfMetadataHash(uploadedPdfBytes);

    if (baseHash === uploadedHash) {
      return { base64: newFileBase64 };
    }
    return { error: 'PDFs do NOT match based on page number, width, and height' };
  } catch (err) {
    console.error('Validation Error:', err.message);
    return { error: err.message };
  }
};
