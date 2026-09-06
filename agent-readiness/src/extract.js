// Turns a page into the product record an agent would actually build.
import {
  jsonLdBlocks, flattenLd, hasType, typeList, metaContent, microdataTypes, microdataProps,
  title, lang, linkRel, linkRelAll, images, links, forms, visibleText, pricesInText, allTags, attrOf,
} from './html.js';

const first = (v) => (Array.isArray(v) ? v[0] : v);
const str = (v) => {
  const x = first(v);
  if (x == null) return null;
  if (typeof x === 'object') return x.name || x['@id'] || x.value || null;
  return String(x);
};

function offersOf(product) {
  const raw = product?.offers;
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const out = [];
  for (const o of list) {
    if (!o || typeof o !== 'object') continue;
    if (hasType(o, 'AggregateOffer')) {
      out.push({ ...o, __aggregate: true });
      const nested = o.offers ? (Array.isArray(o.offers) ? o.offers : [o.offers]) : [];
      out.push(...nested.filter((x) => x && typeof x === 'object'));
    } else out.push(o);
  }
  return out;
}

function normaliseAvailability(v) {
  const s = str(v);
  if (!s) return null;
  return s.replace(/^https?:\/\/schema\.org\//i, '').replace(/^schema:/i, '');
}

export function extractProduct(html, pageUrl) {
  const blocks = jsonLdBlocks(html);
  const nodes = flattenLd(blocks);
  const productNode = nodes.find((n) => hasType(n, 'Product', 'ProductGroup', 'Vehicle', 'IndividualProduct'));
  const breadcrumb = nodes.find((n) => hasType(n, 'BreadcrumbList'));
  const org = nodes.find((n) => hasType(n, 'Organization', 'OnlineStore', 'Store', 'LocalBusiness'));
  const itemList = nodes.find((n) => hasType(n, 'ItemList'));
  const faq = nodes.find((n) => hasType(n, 'FAQPage'));

  const offers = offersOf(productNode);
  const mainOffer = offers.find((o) => !o.__aggregate) || offers[0] || null;

  const ogType = metaContent(html, { property: 'og:type' });
  const ogTitle = metaContent(html, { property: 'og:title' });
  const ogImage = metaContent(html, { property: 'og:image' });
  const ogPrice =
    metaContent(html, { property: 'product:price:amount' }) ||
    metaContent(html, { property: 'og:price:amount' });
  const ogCurrency =
    metaContent(html, { property: 'product:price:currency' }) ||
    metaContent(html, { property: 'og:price:currency' });
  const ogAvailability =
    metaContent(html, { property: 'product:availability' }) ||
    metaContent(html, { property: 'og:availability' });

  const md = { types: microdataTypes(html), props: microdataProps(html) };
  const mdProduct = md.types.some((t) => /product/i.test(t));

  const shipping = mainOffer?.shippingDetails || productNode?.shippingDetails || null;
  const returns =
    mainOffer?.hasMerchantReturnPolicy || productNode?.hasMerchantReturnPolicy || null;

  const variantNodes = productNode?.hasVariant
    ? (Array.isArray(productNode.hasVariant) ? productNode.hasVariant : [productNode.hasVariant])
    : [];

  const product = {
    source: productNode ? 'json-ld' : mdProduct ? 'microdata' : ogType && /product/i.test(ogType) ? 'opengraph' : null,
    name: str(productNode?.name) || ogTitle || title(html),
    description: str(productNode?.description) || metaContent(html, { name: 'description' }),
    sku: str(productNode?.sku),
    gtin:
      str(productNode?.gtin13) || str(productNode?.gtin) || str(productNode?.gtin14) ||
      str(productNode?.gtin12) || str(productNode?.gtin8) || str(productNode?.ean) || null,
    mpn: str(productNode?.mpn),
    brand: str(productNode?.brand),
    category: str(productNode?.category),
    color: str(productNode?.color),
    size: str(productNode?.size),
    material: str(productNode?.material),
    condition: normaliseAvailability(mainOffer?.itemCondition || productNode?.itemCondition),
    image: str(productNode?.image) || ogImage,
    imageCount: productNode?.image ? (Array.isArray(productNode.image) ? productNode.image.length : 1) : ogImage ? 1 : 0,
    price: str(mainOffer?.price) || str(mainOffer?.lowPrice) || ogPrice,
    priceCurrency: str(mainOffer?.priceCurrency) || ogCurrency,
    priceValidUntil: str(mainOffer?.priceValidUntil),
    priceSpecification: mainOffer?.priceSpecification || null,
    unitPrice: productNode?.unitPriceSpecification || mainOffer?.unitPriceSpecification || null,
    availability: normaliseAvailability(mainOffer?.availability) || (ogAvailability ? String(ogAvailability) : null),
    availabilityStarts: str(mainOffer?.availabilityStarts),
    inventoryLevel:
      mainOffer?.inventoryLevel?.value ?? mainOffer?.inventoryLevel ?? productNode?.inventoryLevel?.value ?? null,
    seller: str(mainOffer?.seller) || str(org?.name),
    acceptedPaymentMethod: mainOffer?.acceptedPaymentMethod
      ? (Array.isArray(mainOffer.acceptedPaymentMethod) ? mainOffer.acceptedPaymentMethod : [mainOffer.acceptedPaymentMethod]).map(str)
      : [],
    eligibleRegion: str(mainOffer?.eligibleRegion) || str(mainOffer?.areaServed),
    shipping: shipping
      ? {
          rate: str(shipping.shippingRate?.value) ?? str(shipping.shippingRate),
          currency: str(shipping.shippingRate?.currency),
          destination: str(shipping.shippingDestination?.addressCountry) || str(shipping.shippingDestination),
          handlingTime: shipping.deliveryTime?.handlingTime ? JSON.stringify(shipping.deliveryTime.handlingTime) : null,
          transitTime: shipping.deliveryTime?.transitTime ? JSON.stringify(shipping.deliveryTime.transitTime) : null,
        }
      : null,
    returns: returns
      ? {
          days: str(returns.merchantReturnDays),
          category: normaliseAvailability(returns.returnPolicyCategory),
          fees: normaliseAvailability(returns.returnFees),
          country: str(returns.applicableCountry),
        }
      : null,
    rating: productNode?.aggregateRating
      ? { value: str(productNode.aggregateRating.ratingValue), count: str(productNode.aggregateRating.reviewCount) || str(productNode.aggregateRating.ratingCount) }
      : null,
    variantCount: variantNodes.length || (offers.filter((o) => !o.__aggregate).length > 1 ? offers.filter((o) => !o.__aggregate).length : 0),
    variantAvailability: variantNodes
      .map((v) => normaliseAvailability(offersOf(v)[0]?.availability))
      .filter(Boolean),
    url: str(productNode?.url) || pageUrl,
    raw: productNode || null,
  };

  return {
    product,
    hasProductNode: Boolean(productNode),
    ldTypes: [...new Set(nodes.flatMap(typeList))],
    ldParseErrors: blocks.filter((b) => b.__parseError).length,
    ldBlockCount: blocks.length,
    microdata: md,
    breadcrumb: Boolean(breadcrumb),
    organization: org ? { name: str(org.name), sameAs: org.sameAs || null } : null,
    itemList: Boolean(itemList),
    faq: Boolean(faq),
    og: { type: ogType, title: ogTitle, image: ogImage, price: ogPrice, currency: ogCurrency, availability: ogAvailability },
  };
}

export function pageSignals(html, pageUrl) {
  const text = visibleText(html);
  const imgs = images(html);
  const anchors = links(html);
  const canonical = linkRel(html, 'canonical');
  const hreflang = linkRelAll(html, 'alternate').filter((l) => /hreflang/i.test(l.tag));
  const formList = forms(html);
  const scripts = allTags(html, 'script');
  const noscript = /<noscript\b/i.test(html);

  const addToCart = /add[\s_-]?to[\s_-]?(cart|bag|basket)|in den warenkorb|do koszyka|do košíku|přidat do košíku|προσθήκη στο καλάθι|dodaj v košarico|do košíka/i.test(html);
  const cartLinks = anchors.filter((a) => /\/(cart|basket|warenkorb|kosik|ko%C5%A1%C3%ADk|koszyk|kosarica|checkout|kasse|pokladna|zamowienie|kalathi)\b/i.test(a.href || ''));
  const loginWall = /(sign in to (continue|checkout)|log in to (continue|checkout)|anmelden, um|konto erforderlich|zaloguj si|přihlaste se)/i.test(text);
  const guestCheckout = /(guest checkout|continue as guest|ohne konto|als gast|bez rejestracji|jako host|nákup bez registrace|χωρίς λογαριασμό)/i.test(text);

  return {
    title: title(html),
    lang: lang(html),
    canonical,
    hreflang: hreflang.map((l) => ({ href: l.href, lang: attrOf(l.tag, 'hreflang') })),
    textLength: text.length,
    wordCount: text ? text.split(/\s+/).length : 0,
    textSample: text.slice(0, 1200),
    prices: pricesInText(text),
    imageCount: imgs.length,
    imagesWithAlt: imgs.filter((i) => i.hasAlt && (i.alt || '').trim().length > 0).length,
    linkCount: anchors.length,
    internalLinks: anchors.filter((a) => {
      try { return new URL(a.href, pageUrl).host === new URL(pageUrl).host; } catch { return false; }
    }).length,
    hashOnlyLinks: anchors.filter((a) => (a.href || '').trim() === '#' || (a.href || '').startsWith('javascript:')).length,
    formCount: formList.length,
    forms: formList.map((f) => ({ action: f.action, method: f.method })),
    scriptCount: scripts.length,
    hasNoscript: noscript,
    headings: {
      h1: (html.match(/<h1\b/gi) || []).length,
      h2: (html.match(/<h2\b/gi) || []).length,
    },
    semanticLandmarks: ['main', 'nav', 'header', 'footer', 'article', 'section'].filter((t) =>
      new RegExp(`<${t}\\b`, 'i').test(html)
    ),
    addToCart,
    cartLinks: cartLinks.slice(0, 5).map((a) => a.href),
    loginWall,
    guestCheckout,
    metaRobots: metaContent(html, { name: 'robots' }),
  };
}
