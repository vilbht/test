// Pillar 5 - Checkout: can an agent actually complete the purchase, and can the
// payment be authorised with the right trust signals?
const ACP_HINT = /(agentic[\s_-]?commerce|checkout_sessions|agent[\s_-]?pay|agentic checkout|shoppingagent|x-agent-|delegated[\s_-]?payment|agent[\s_-]?token)/i;

export default function checkout(ctx) {
  const { signals, extracted, wellKnown, market, agentView } = ctx;
  const p = extracted.product;
  const checks = [];
  const body = agentView.body;

  // 1. Add-to-cart mechanics.
  const cartForm = signals.forms.find((f) => /cart|basket|warenkorb|kosik|koszyk|basket/i.test(f.action || ''));
  checks.push({
    id: 'add_to_cart',
    label: 'Add-to-cart works without executing the app bundle',
    weight: 7,
    ...(cartForm
      ? { status: 'pass', score: 1, agent: `A real <form ${cartForm.method.toUpperCase()} ${cartForm.action}> exists, so the action is reproducible.` }
      : signals.addToCart
        ? { status: 'partial', score: 0.35, agent: 'An add-to-cart control exists but it is a JavaScript handler with no form or URL. An agent has to drive a headless browser, which is slow, brittle and often blocked.' }
        : { status: 'fail', score: 0, agent: 'No add-to-cart affordance found in the server HTML.' }),
    human: 'Clicks the button and the item appears in the basket.',
    fix: 'Keep a no-JS form fallback, or publish a documented cart API / add-to-cart deep link with SKU and quantity parameters.',
    talkTrack: 'Ask whether they can generate a shareable pre-filled cart URL. Many platforms already can and nobody has told commerce.',
  });

  // 2. Cart deep link.
  checks.push({
    id: 'cart_deeplink',
    label: 'Pre-filled cart or checkout deep link',
    weight: 4,
    ...(signals.cartLinks.length
      ? { status: 'partial', score: 0.6, agent: `Cart URLs are discoverable (${signals.cartLinks.slice(0, 2).join(', ')}), but a SKU-parameterised deep link was not confirmed.` }
      : { status: 'fail', score: 0, agent: 'No cart or checkout URL exposed in the HTML. The agent cannot hand a ready basket to the shopper.' }),
    human: 'Navigates to the basket from the header icon.',
    fix: 'Support /cart?add=SKU:qty style deep links. This is the cheapest first step to an agent-assisted handover.',
  });

  // 3. Guest checkout.
  checks.push({
    id: 'guest_checkout',
    label: 'Purchase possible without a forced account',
    weight: 5,
    ...(signals.guestCheckout
      ? { status: 'pass', score: 1, agent: 'Guest checkout is advertised on the page.' }
      : signals.loginWall
        ? { status: 'fail', score: 0, agent: 'Account/login appears to be required. An agent acting for a shopper cannot create or use an account on their behalf without stored credentials.' }
        : { status: 'manual', score: 0.5, agent: 'Guest checkout could not be confirmed from the product page. Verify in the funnel.' }),
    human: 'Logs in, or clicks "continue as guest".',
    fix: 'Guarantee a guest path, and let a delegated agent pass shopper details in one step rather than through a multi-page form.',
  });

  // 4. Agentic checkout protocol surface.
  const protoSurfaces = ['acp', 'mcp', 'aiplugin', 'agentcard'].filter((k) => wellKnown[k]?.found);
  const inlineHint = ACP_HINT.test(body);
  checks.push({
    id: 'agentic_protocol',
    label: 'Agentic checkout protocol endpoint (ACP / MCP / agent card)',
    weight: 8,
    ...(protoSurfaces.length
      ? { status: 'pass', score: 1, agent: `Declared: ${protoSurfaces.map((s) => wellKnown[s].label).join(', ')}. The merchant can accept a programmatic order.` }
      : inlineHint
        ? { status: 'partial', score: 0.4, agent: 'Agentic-commerce keywords appear in the page source but no discovery endpoint is published. Possibly a pilot in progress.' }
        : { status: 'fail', score: 0, agent: 'No agentic checkout endpoint. Any agent purchase has to be simulated through the human UI, which no scheme or PSP can underwrite.' }),
    human: 'Not applicable.',
    fix: 'Expose a checkout session API for agents (Agentic Commerce Protocol style) so orders arrive as signed, attributable requests rather than scripted clicks.',
    talkTrack: 'This is the core Mastercard conversation: an agent-initiated payment needs a recognisable agent identity, not a bot pretending to be a browser.',
  });

  // 5. Payment methods declared machine-readably.
  checks.push({
    id: 'payment_methods',
    label: 'Accepted payment methods in machine-readable form',
    weight: 4,
    ...(p.acceptedPaymentMethod.length
      ? { status: 'pass', score: 1, agent: `acceptedPaymentMethod: ${p.acceptedPaymentMethod.join(', ')}` }
      : { status: 'fail', score: 0, agent: 'No acceptedPaymentMethod in the offer. The agent cannot tell before checkout whether the credential it holds will be accepted.' }),
    human: `Sees payment logos in the footer. Locally expects: ${market.methods.join(', ')}.`,
    fix: 'Declare offers.acceptedPaymentMethod, and state which methods support delegated/tokenised agent payments.',
    talkTrack: market.note,
  });

  // 6. Tokenisation / network-token readiness signals.
  const walletHints = [
    ['Click to Pay', /click[\s_-]?to[\s_-]?pay|src\.mastercard|secure remote commerce/i],
    ['Apple Pay', /apple[\s_-]?pay|apple-pay-merchant/i],
    ['Google Pay', /google[\s_-]?pay|googlepay/i],
    ['PayPal', /paypal/i],
    ['Klarna', /klarna/i],
    ['BLIK', /\bblik\b/i],
    ['3-D Secure', /3ds|three[\s_-]?d[\s_-]?secure|acs[\s_-]?url|cardinalcommerce/i],
  ].filter(([, re]) => re.test(body)).map(([n]) => n);
  checks.push({
    id: 'tokenisation',
    label: 'Tokenised / wallet payment rails present',
    weight: 4,
    ...(walletHints.length >= 2
      ? { status: 'pass', score: 1, agent: `Detected on the page: ${walletHints.join(', ')}. Tokenised rails are the practical route to agent-initiated payment.` }
      : walletHints.length === 1
        ? { status: 'partial', score: 0.5, agent: `Only ${walletHints[0]} detected. Limited tokenised coverage.` }
        : { status: 'manual', score: 0.3, agent: 'No wallet or tokenisation signal on this page. Confirm the PSP setup with the merchant - it may only appear in the checkout funnel.' }),
    human: 'Sees express-checkout buttons and pays in two taps.',
    fix: 'Network tokens and wallet rails carry the credential-on-file and delegated-authentication semantics that agent payments will be built on.',
    talkTrack: 'Bridge to Agent Pay: agent-initiated transactions need a tokenised credential with an agent identity attached, not a raw PAN in a form.',
  });

  // 7. SCA / delegated authentication friction (PSD2 reality in these markets).
  checks.push({
    id: 'sca',
    label: 'SCA handled without a human tap (delegated authentication)',
    weight: 4,
    status: 'manual',
    score: 0.3,
    agent: 'Not observable from outside the funnel. Under PSD2 most card payments in this market need strong customer authentication, which by default breaks an unattended agent purchase.',
    human: 'Approves in the banking app and thinks nothing of it.',
    fix: 'Plan for delegated authentication / trusted-beneficiary or agent-token exemptions so the agent can complete without a live app tap, and define the fallback when a step-up is unavoidable.',
    talkTrack: 'The most valuable question in the room: "when your agent buys at 2am and the bank asks for a 3DS challenge, what happens?" Nobody has an answer yet - that is the opening.',
  });

  // 8. Order status / post-purchase.
  checks.push({
    id: 'post_purchase',
    label: 'Machine-readable order status and returns',
    weight: 3,
    status: p.returns ? 'partial' : 'manual',
    score: p.returns ? 0.5 : 0.25,
    agent: p.returns
      ? 'Return policy is structured, but no order-status or tracking API was discoverable.'
      : 'Neither return policy nor order-status interface is machine-readable. The agent cannot answer "where is my order?" or start a return.',
    human: 'Gets an email and clicks a tracking link.',
    fix: 'Expose order status, tracking and return initiation to the agent that placed the order. Post-purchase is where agent trust is actually won or lost.',
    talkTrack: 'Disputes and chargebacks land with the issuer. A merchant with no agent-readable post-purchase path exports that cost to the scheme.',
  });

  // 9. Liability and merchant of record.
  checks.push({
    id: 'liability',
    label: 'Agent-initiated transaction rules agreed with the PSP',
    weight: 3,
    status: 'manual',
    score: 0.2,
    agent: 'Not detectable. Whether agent-initiated orders are flagged, how they are authenticated and who carries liability is a commercial question.',
    human: 'Not applicable.',
    fix: 'Agree how agent-initiated transactions are identified in the authorisation message, and what the fraud and dispute treatment is.',
    talkTrack: 'Your differentiator. Readiness is not only technical - the merchant needs the acquirer, PSP and scheme aligned before they switch this on.',
  });

  return { id: 'checkout', checks };
}
