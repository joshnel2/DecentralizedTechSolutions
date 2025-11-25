# ⚡ InvoiceForge

**Professional Invoice Generator** — Create beautiful invoices instantly for $2.99 per download.

## 💰 Revenue Model

- **Price**: $2.99 per invoice PDF download
- **Payment**: Stripe Checkout (supports all major cards, Apple Pay, Google Pay)
- **No subscription required** — Pay only when you download
- **Zero data stored** — All invoice data stays in user's browser

## 🚀 Features

- Beautiful, professional invoice templates
- Live preview as you type
- PDF generation (client-side with jsPDF)
- Multi-currency support (USD, EUR, GBP, CAD, AUD)
- Tax and discount calculations
- Data persistence in localStorage
- Mobile-responsive design
- No signup required

## 💳 Setting Up Stripe (Production)

1. Create a Stripe account at https://stripe.com
2. Get your publishable key from the Stripe Dashboard
3. Update `CONFIG.stripePublishableKey` in `src/app.js`
4. Set `CONFIG.demoMode` to `false`
5. Create a backend endpoint `/api/create-checkout-session` that:
   - Creates a Stripe Checkout session with the product price
   - Returns the session ID to redirect the user

Example backend (Node.js):

```javascript
const stripe = require('stripe')('sk_live_YOUR_SECRET_KEY');

app.post('/api/create-checkout-session', async (req, res) => {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Professional Invoice PDF',
        },
        unit_amount: 299, // $2.99 in cents
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: 'https://yourdomain.com/?payment=success',
    cancel_url: 'https://yourdomain.com/',
  });
  
  res.json({ id: session.id });
});
```

## 🛠️ Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 📈 Marketing Tips

1. **SEO Keywords**: "free invoice generator", "invoice maker", "create invoice online"
2. **Target Audience**: Freelancers, small businesses, contractors
3. **Value Proposition**: No signup, no subscription, professional quality
4. **Conversion Optimization**: 
   - Users create invoices for FREE
   - Only pay when they want to download
   - Low price point ($2.99) reduces friction

## 📁 Project Structure

```
├── index.html          # Main HTML file
├── src/
│   ├── app.js         # JavaScript application logic
│   └── style.scss     # Styles (compiled by Vite)
├── assets/
│   └── favicon.svg    # App icon
└── package.json       # Dependencies
```

## 📄 License

MIT — Use this to make money!
