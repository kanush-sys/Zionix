// api/callback.js — Zionix M-Pesa Callback Receiver
// Safaricom POSTs payment results here automatically.
// On success: grants lifetime access server-side.
const supabase = require('./_supabase');
const { setCors } = require('./_helpers');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

  try {
    const stkCallback = req.body?.Body?.stkCallback;
    if (!stkCallback) return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stkCallback;

    if (String(ResultCode) === '0') {
      const items  = CallbackMetadata?.Item || [];
      const get    = name => items.find(i => i.Name === name)?.Value;
      const amount = get('Amount');
      const code   = get('MpesaReceiptNumber');
      const phone  = String(get('PhoneNumber') || '');

      console.log('✅ Zionix Payment SUCCESS:', { CheckoutRequestID, code, amount, phone });

      await supabase.from('payments').update({
        status: 'success', mpesa_code: code,
        confirmed_at: new Date().toISOString(),
        callback_payload: req.body,
      }).eq('checkout_request_id', CheckoutRequestID);

      const { data: payment } = await supabase.from('payments')
        .select('user_id').eq('checkout_request_id', CheckoutRequestID).single();

      if (payment?.user_id) {
        await supabase.from('profiles').update({
          lifetime: true,
          lifetime_since: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', payment.user_id);
        console.log('✅ Lifetime access granted to user:', payment.user_id);
      } else {
        // Paid without account — store by phone for later claim
        await supabase.from('pending_lifetime').upsert({
          phone, mpesa_code: code, amount,
          paid_at: new Date().toISOString(),
        });
        console.log('✅ Lifetime pending claim for phone:', phone);
      }
    } else {
      console.log('❌ Payment FAILED:', { CheckoutRequestID, ResultCode, ResultDesc });
      await supabase.from('payments').update({
        status: 'failed', failure_reason: ResultDesc,
        callback_payload: req.body,
      }).eq('checkout_request_id', CheckoutRequestID);
    }

    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Callback received.' });
  } catch (e) {
    console.error('Callback error:', e.message);
    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }
};
