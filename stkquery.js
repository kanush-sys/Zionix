// api/stkquery.js — Zionix STK Push Status Query
// POST /api/stkquery { checkoutRequestId }
// On SUCCESS: grants lifetime access in Supabase profiles table
const axios = require('axios');
const supabase = require('./_supabase');
const { setCors, handleOptions, getUser, ok, err } = require('./_helpers');

function getTimestamp() {
  const n = new Date(), p = v => String(v).padStart(2,'0');
  return `${n.getFullYear()}${p(n.getMonth()+1)}${p(n.getDate())}${p(n.getHours())}${p(n.getMinutes())}${p(n.getSeconds())}`;
}
function buildPassword(sc, pk, ts) { return Buffer.from(sc + pk + ts).toString('base64'); }
async function getOAuthToken(key, secret, baseUrl) {
  const creds = Buffer.from(`${key}:${secret}`).toString('base64');
  const { data } = await axios.get(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${creds}` }, timeout: 10000 });
  return data.access_token;
}

module.exports = async (req, res) => {
  setCors(res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return err(res, 405, 'Use POST.');

  const KEY       = process.env.MPESA_CONSUMER_KEY;
  const SECRET    = process.env.MPESA_CONSUMER_SECRET;
  const SHORTCODE = process.env.MPESA_SHORTCODE || '174379';
  const PASSKEY   = process.env.MPESA_PASSKEY   || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
  const MPESA_ENV = process.env.MPESA_ENV       || 'sandbox';
  const BASE_URL  = MPESA_ENV === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';

  const { checkoutRequestId } = req.body || {};
  if (!checkoutRequestId) return err(res, 400, 'checkoutRequestId is required.');

  const user = await getUser(req);

  try {
    const token     = await getOAuthToken(KEY, SECRET, BASE_URL);
    const timestamp = getTimestamp();
    const password  = buildPassword(SHORTCODE, PASSKEY, timestamp);

    const response = await axios.post(`${BASE_URL}/mpesa/stkpushquery/v1/query`, {
      BusinessShortCode: SHORTCODE, Password: password,
      Timestamp: timestamp, CheckoutRequestID: checkoutRequestId,
    }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 10000 });

    const data       = response.data;
    const resultCode = String(data.ResultCode);

    if (resultCode === '0') {
      // ── PAYMENT SUCCESS — Grant lifetime access ──
      await supabase.from('payments')
        .update({ status: 'success', confirmed_at: new Date().toISOString() })
        .eq('checkout_request_id', checkoutRequestId);

      const userId = user?.id;
      if (userId) {
        await supabase.from('profiles').update({
          lifetime: true,
          lifetime_since: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', userId);
        console.log('✅ Zionix lifetime granted to user:', userId);
      } else {
        await supabase.from('payments')
          .update({ lifetime_granted: true })
          .eq('checkout_request_id', checkoutRequestId);
      }

      return ok(res, { status: 'SUCCESS', message: 'Lifetime access activated.' });

    } else if (resultCode === '1032') {
      await supabase.from('payments').update({ status: 'cancelled' }).eq('checkout_request_id', checkoutRequestId);
      return ok(res, { status: 'FAILED', reason: 'You cancelled the M-Pesa payment. Please try again.' });
    } else if (resultCode === '1037') {
      await supabase.from('payments').update({ status: 'timeout' }).eq('checkout_request_id', checkoutRequestId);
      return ok(res, { status: 'FAILED', reason: 'M-Pesa prompt timed out. Please try again.' });
    } else {
      return ok(res, { status: 'FAILED', reason: data.ResultDesc || 'Payment failed. Check your M-Pesa balance.' });
    }

  } catch (e) {
    const errData = e?.response?.data;
    if (errData?.errorCode === '500.001.1001') return ok(res, { status: 'PENDING' });
    console.warn('STK Query error:', errData || e.message);
    return ok(res, { status: 'PENDING' });
  }
};
