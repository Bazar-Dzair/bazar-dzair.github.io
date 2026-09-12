/*
 * i18n.js — محرك تبديل اللغة (عربي / فرنسي) لموقع Bazar Dzair
 * -------------------------------------------------------------
 * هذا الملف مستقل تمامًا ولا يغيّر أي شيء في نظام الطلبات أو Telegram أو Firebase.
 * كل الدوال هنا معرّفة داخل الكائن العام window.BazarI18n، ولا تُنفَّذ تلقائيًا
 * أي حركة على البيانات المُرسلة للطلبات — فقط على واجهة العرض (النصوص المعروضة للزبون).
 *
 * كيف يعمل:
 * 1) اللغة المختارة تُحفظ في localStorage تحت المفتاح "bazarLang" ("ar" أو "fr").
 * 2) BazarI18n.t(key) يرجع النص المناسب حسب اللغة الحالية من القاموس UI_DICT.
 * 3) BazarI18n.applyStatic() يبحث عن كل عنصر فيه data-i18n ويضبط نصه تلقائيًا،
 *    وكذلك data-i18n-ph (placeholder) و data-i18n-aria (aria-label) و data-i18n-title.
 * 4) BazarI18n.translateProduct(p) يرجع {name, description} بالفرنسية إذا كانت
 *    متوفرة في بيانات المنتج (name_fr / description_fr) وإلا يرجع النص الأصلي كما هو
 *    (لا يوجد أي تخمين أو ترجمة آلية تلقائية للمنتجات التي لا تملك حقول fr).
 * 5) BazarI18n.wilayaNameFor(code, lang) لعرض اسم الولاية بأي لغة.
 *    مهم جدًا: عند إرسال الطلب يجب دائمًا استخدام BazarI18n.wilayaNameFor(code,"ar")
 *    (وليس نص الخيار المعروض في القائمة) حتى يبقى الاسم المُرسَل إلى Telegram/Firestore
 *    بالعربية دائمًا كما هو الحال حاليًا، بغض النظر عن لغة واجهة الزبون.
 */
(function (global) {
  "use strict";

  var LANG_KEY = "bazarLang";

  // ===================== قاموس نصوص الواجهة =====================
  var UI_DICT = {
    topbar_service:   { ar: "خدمة عملاء مميزة",              fr: "Service client de qualité" },
    topbar_delivery:  { ar: "توصيل إلى جميع الولايات",        fr: "Livraison dans toutes les wilayas" },
    topbar_cod:       { ar: "الدفع عند الاستلام",             fr: "Paiement à la livraison" },

    nav_home:         { ar: "الرئيسية",                       fr: "Accueil" },
    nav_products:     { ar: "المنتجات",                       fr: "Produits" },

    aria_cart:        { ar: "السلة",                          fr: "Panier" },
    aria_menu:        { ar: "القائمة",                        fr: "Menu" },

    brand_subtitle:   { ar: "متجر إلكتروني",                  fr: "Boutique en ligne" },

    drawer_title:     { ar: "🗂️ الفئات",                      fr: "🗂️ Catégories" },
    drawer_all:       { ar: "جميع الفئات",                    fr: "Toutes les catégories" },
    drawer_loading:   { ar: "جاري تحميل الفئات...",           fr: "Chargement des catégories..." },
    drawer_none:      { ar: "لا توجد فئات",                   fr: "Aucune catégorie" },
    drawer_error:     { ar: "تعذر تحميل الفئات",              fr: "Échec du chargement des catégories" },

    products_title:    { ar: "منتجاتنا 🛍️",                   fr: "Nos produits 🛍️" },
    products_subtitle: { ar: "أفضل العروض و أحدث المنتجات",   fr: "Les meilleures offres et les derniers produits" },
    view_all:          { ar: "عرض الكل ←",                    fr: "Voir tout →" },

    benefit_service_title: { ar: "خدمة عملاء",     fr: "Service client" },
    benefit_service_desc:  { ar: "نحن في خدمتكم 7/7", fr: "À votre service 7j/7" },
    benefit_genuine_title: { ar: "منتجات أصلية",   fr: "Produits authentiques" },
    benefit_genuine_desc:  { ar: "جودة مضمونة",     fr: "Qualité garantie" },
    benefit_delivery_title:{ ar: "توصيل سريع",      fr: "Livraison rapide" },
    benefit_delivery_desc: { ar: "إلى جميع الولايات", fr: "Vers toutes les wilayas" },
    benefit_cod_title:     { ar: "الدفع عند الاستلام", fr: "Paiement à la livraison" },
    benefit_cod_desc:      { ar: "ادفع عند استلام طلبك", fr: "Payez à la réception de votre commande" },

    footer_description: { ar: "متجر إلكتروني جزائري يوفر منتجات متنوعة، أسعار مناسبة وخدمة توصيل سريعة وآمنة.",
                           fr: "Boutique en ligne algérienne proposant des produits variés, des prix avantageux et une livraison rapide et sécurisée." },
    footer_links_title:   { ar: "روابط مهمة",     fr: "Liens utiles" },
    footer_about:         { ar: "من نحن",         fr: "Qui sommes-nous" },
    footer_privacy:       { ar: "سياسة الخصوصية", fr: "Politique de confidentialité" },
    footer_terms:         { ar: "الشروط والأحكام", fr: "Conditions générales" },
    footer_customer_title:{ ar: "خدمة الزبائن",   fr: "Service client" },
    footer_faq:           { ar: "❓ أسئلة شائعة",   fr: "❓ Questions fréquentes" },
    footer_track:         { ar: "📦 تتبع طلبي",     fr: "📦 Suivre ma commande" },
    footer_delivery_policy:{ ar: "🚚 سياسة التوصيل", fr: "🚚 Politique de livraison" },
    footer_whatsapp:      { ar: "💬 واتساب متوفر للطلبات", fr: "💬 WhatsApp disponible pour les commandes" },
    footer_copyright:     { ar: "© 2026 Bazar Dzair ❤️ — جميع الحقوق محفوظة", fr: "© 2026 Bazar Dzair ❤️ — Tous droits réservés" },

    about_text: {
      ar: "Bazar Dzair متجر إلكتروني جزائري يهدف لتوفير منتجات متنوعة وأصلية بأسعار مناسبة، مع خدمة توصيل لمختلف ولايات الوطن ودفع آمن عند الاستلام.",
      fr: "Bazar Dzair est une boutique en ligne algérienne qui propose des produits variés et authentiques à des prix avantageux, avec une livraison dans toutes les wilayas et un paiement sécurisé à la livraison."
    },
    privacy_text: {
      ar: "نجمع فقط المعلومات الضرورية لإتمام طلبك: الاسم، رقم الهاتف، الولاية والعنوان. تُستخدم هذه المعلومات حصريًا لتنفيذ وتوصيل طلبك، ولا تُشارك مع أي جهة خارج شركات التوصيل المعتمدة (Noest، DHD) اللازمة لإيصال الطلب إليك.\n\nلا يقوم المتجر بتخزين أي معلومات دفع بنكية، لأن الدفع يتم عند الاستلام نقدًا فقط.\n\nلأي استفسار حول بياناتك الشخصية، تواصل معنا عبر الهاتف أو واتساب.",
      fr: "Nous collectons uniquement les informations nécessaires pour traiter votre commande : nom, numéro de téléphone, wilaya et adresse. Ces informations sont utilisées exclusivement pour l'exécution et la livraison de votre commande, et ne sont partagées avec personne en dehors des sociétés de livraison partenaires (Noest, DHD) nécessaires pour vous livrer.\n\nLa boutique ne stocke aucune information de paiement bancaire, le paiement se faisant uniquement en espèces à la livraison.\n\nPour toute question concernant vos données personnelles, contactez-nous par téléphone ou WhatsApp."
    },
    terms_text: {
      ar: "الأسعار المعروضة بالدينار الجزائري (دج) وقابلة للتغيير دون إشعار مسبق.\n\nطريقة الدفع الوحيدة المتاحة حاليًا هي الدفع عند الاستلام (COD).\n\nصور المنتجات تقريبية وقد تختلف بعض التفاصيل البسيطة (كاللون) عن المنتج الفعلي.\n\nيحق للزبون إلغاء الطلب قبل شحنه بالتواصل معنا مباشرة.\n\nباستخدامك لهذا الموقع وإتمام طلب، فإنك توافق على هذه الشروط.",
      fr: "Les prix affichés sont en dinars algériens (DA) et peuvent être modifiés sans préavis.\n\nLe seul mode de paiement disponible actuellement est le paiement à la livraison (COD).\n\nLes photos des produits sont indicatives et certains détails mineurs (comme la couleur) peuvent différer du produit réel.\n\nLe client a le droit d'annuler sa commande avant son expédition en nous contactant directement.\n\nEn utilisant ce site et en passant une commande, vous acceptez ces conditions."
    },
    faq_text: {
      ar: "🛒 كيف أطلب؟\nاختر المنتج، ثم اضغط \"اشترِ الآن\" وأدخل معلوماتك (الاسم، الهاتف، الولاية، العنوان).\n\n💵 ما هي طريقة الدفع؟\nالدفع عند الاستلام فقط — تدفع نقدًا عند وصول الطلب لبابك، بلا حاجة لبطاقة بنكية أو دفع مسبق.\n\n🚚 كم يستغرق التوصيل؟\nيختلف حسب الولاية، عادة بين 2 إلى 7 أيام عمل.\n\n↩️ هل أقدر أرجع المنتج؟\nنعم، تواصل معنا عبر الهاتف أو واتساب قبل استلام الطلب أو خلال مدة قصيرة بعده، وسنوضح لك خطوات الإرجاع.",
      fr: "🛒 Comment commander ?\nChoisissez le produit, puis cliquez sur \"Acheter maintenant\" et entrez vos informations (nom, téléphone, wilaya, adresse).\n\n💵 Quel est le mode de paiement ?\nPaiement à la livraison uniquement — vous payez en espèces à la réception de votre commande, sans carte bancaire ni paiement anticipé.\n\n🚚 Combien de temps prend la livraison ?\nCela varie selon la wilaya, généralement entre 2 et 7 jours ouvrables.\n\n↩️ Puis-je retourner le produit ?\nOui, contactez-nous par téléphone ou WhatsApp avant la réception de la commande ou peu après, et nous vous expliquerons les étapes du retour."
    },
    track_text: {
      ar: "لمتابعة حالة طلبك، تواصل معنا مباشرة عبر الهاتف أو واتساب مع ذكر اسمك ورقم هاتفك المسجل في الطلب، وسنعطيك آخر تحديث عن حالة التوصيل.",
      fr: "Pour suivre l'état de votre commande, contactez-nous directement par téléphone ou WhatsApp en indiquant votre nom et le numéro de téléphone utilisé lors de la commande, et nous vous donnerons la dernière mise à jour sur la livraison."
    },
    delivery_policy_text: {
      ar: "نوفر التوصيل إلى مختلف ولايات الجزائر عبر Noest وDHD، سواء إلى المنزل أو إلى المكتب حسب توفر الخدمة.\n\nتختلف تكلفة التوصيل حسب الولاية وطريقة الاستلام، وتظهر للزبون عند تأكيد الطلب.\n\nمدة التوصيل تقديرية وقد تختلف حسب الولاية وشركة التوصيل.\n\nفي حالة رفض أو عدم استلام الطلب، قد تُطبق رسوم الإرجاع حسب شركة التوصيل.",
      fr: "Nous livrons dans les différentes wilayas d'Algérie via Noest et DHD, à domicile ou au bureau selon la disponibilité du service.\n\nLe coût de la livraison varie selon la wilaya et le mode de réception, et il est indiqué au client lors de la confirmation de la commande.\n\nLe délai de livraison est estimatif et peut varier selon la wilaya et la société de livraison.\n\nEn cas de refus ou de non-réception de la commande, des frais de retour peuvent s'appliquer selon la société de livraison."
    },

    detail_alt:        { ar: "تفاصيل المنتج",              fr: "Détails du produit" },
    detail_buy_now:    { ar: "⚡ اشترِ الآن",               fr: "⚡ Acheter maintenant" },
    detail_add_cart:   { ar: "🛒 أضف إلى السلة",           fr: "🛒 Ajouter au panier" },

    cart_title:            { ar: "🛒 سلة المشتريات",        fr: "🛒 Panier" },
    order_info_title:      { ar: "📦 معلومات الطلب",        fr: "📦 Informations de commande" },
    placeholder_name:      { ar: "الاسم واللقب *",          fr: "Nom et prénom *" },
    placeholder_phone:     { ar: "رقم الهاتف *",            fr: "Numéro de téléphone *" },
    placeholder_wilaya:    { ar: "اختر الولاية *",          fr: "Choisir la wilaya *" },
    placeholder_address:   { ar: "العنوان / البلدية *",     fr: "Adresse / Commune *" },
    delivery_method_label: { ar: "طريقة الاستلام",          fr: "Mode de réception" },
    ship_note_default:     { ar: "اختر الولاية لمعرفة سعر التوصيل.", fr: "Choisissez la wilaya pour connaître le prix de livraison." },
    confirm_button:        { ar: "✅ تأكيد الطلب بالدفع عند الاستلام", fr: "✅ Confirmer la commande (paiement à la livraison)" },

    cart_empty_title: { ar: "السلة فارغة 🛒",                         fr: "Votre panier est vide 🛒" },
    cart_empty_sub:   { ar: "اضغط على أي منتج لمشاهدة التفاصيل.",     fr: "Cliquez sur un produit pour voir les détails." },
    cart_per_unit:    { ar: "للقطعة",                                 fr: "l'unité" },

    summary_products: { ar: "مجموع المنتجات",  fr: "Sous-total produits" },
    summary_delivery: { ar: "التوصيل",         fr: "Livraison" },
    summary_total:    { ar: "المجموع النهائي", fr: "Total à payer" },

    delivery_home_label:   { ar: "🏠 توصيل إلى المنزل",  fr: "🏠 Livraison à domicile" },
    delivery_office_label: { ar: "🏤 استلام من المكتب",  fr: "🏤 Retrait au bureau" },

    toast_added_cart:          { ar: "تمت إضافة المنتج إلى السلة ✅",              fr: "Produit ajouté au panier ✅" },
    toast_cart_empty:          { ar: "السلة فارغة ❌",                             fr: "Le panier est vide ❌" },
    toast_incomplete:          { ar: "أكمل معلومات الطلب ⚠️",                     fr: "Veuillez compléter les informations ⚠️" },
    toast_invalid_phone:       { ar: "رقم الهاتف غير صحيح ⚠️",                    fr: "Numéro de téléphone invalide ⚠️" },
    toast_delivery_unavailable:{ ar: "التوصيل غير متوفر لهذه الولاية ❌",         fr: "Livraison indisponible pour cette wilaya ❌" },
    toast_order_failed:        { ar: "تعذر إرسال الطلب، تحقق من الاتصال وحاول مجددًا ⚠️", fr: "Échec de l'envoi de la commande, vérifiez votre connexion et réessayez ⚠️" },
    toast_product_not_found:   { ar: "المنتج غير موجود",                          fr: "Produit introuvable" },
    toast_category_not_found:  { ar: "التصنيف غير موجود",                        fr: "Catégorie introuvable" },
    empty_products:            { ar: "لم نجد المنتج 🔎",                          fr: "Aucun produit trouvé 🔎" },
    badge_unavailable:         { ar: "غير متوفر",                                 fr: "Indisponible" },
    button_unavailable:        { ar: "غير متوفر حاليًا",                          fr: "Actuellement indisponible" },
    ship_unavailable_now:      { ar: "❌ التوصيل غير متوفر لهذه الولاية حالياً.", fr: "❌ Livraison actuellement indisponible pour cette wilaya." },
    ship_price_prefix:         { ar: "🚚 سعر التوصيل: ",                          fr: "🚚 Prix de livraison : " },
    alert_order_success:       { ar: "✅ تم تسجيل طلبك بنجاح",                    fr: "✅ Votre commande a été enregistrée avec succès" },

    aria_add_to_cart: { ar: "إضافة إلى السلة", fr: "Ajouter au panier" },
    buy_button:       { ar: "شراء",            fr: "Acheter" },
    back_to_store:    { ar: "← العودة للمتجر", fr: "← Retour à la boutique" },
    default_product_name: { ar: "منتج بدون اسم", fr: "Produit sans nom" },
    default_product_desc: { ar: "منتج متوفر في متجر Bazar Dzair.", fr: "Produit disponible sur Bazar Dzair." },

    lang_toggle_to_fr: { ar: "Français", fr: "Français" },
    lang_toggle_to_ar: { ar: "العربية",  fr: "العربية" },

    currency_suffix: { ar: "دج", fr: "DA" }
  };

  // ===================== أسماء الولايات (58) =====================
  // الترتيب مطابق تمامًا لترتيب <option> في index.html و product.html حتى لا يختلف أي رمز.
  var WILAYAS = [
    { code: "01", ar: "أدرار",          fr: "Adrar" },
    { code: "02", ar: "الشلف",          fr: "Chlef" },
    { code: "03", ar: "الأغواط",        fr: "Laghouat" },
    { code: "04", ar: "أم البواقي",     fr: "Oum El Bouaghi" },
    { code: "05", ar: "باتنة",          fr: "Batna" },
    { code: "06", ar: "بجاية",          fr: "Béjaïa" },
    { code: "07", ar: "بسكرة",          fr: "Biskra" },
    { code: "08", ar: "بشار",           fr: "Béchar" },
    { code: "09", ar: "البليدة",        fr: "Blida" },
    { code: "10", ar: "البويرة",        fr: "Bouira" },
    { code: "11", ar: "تمنراست",        fr: "Tamanrasset" },
    { code: "12", ar: "تبسة",           fr: "Tébessa" },
    { code: "13", ar: "تلمسان",         fr: "Tlemcen" },
    { code: "14", ar: "تيارت",          fr: "Tiaret" },
    { code: "15", ar: "تيزي وزو",       fr: "Tizi Ouzou" },
    { code: "16", ar: "الجزائر",        fr: "Alger" },
    { code: "17", ar: "الجلفة",         fr: "Djelfa" },
    { code: "18", ar: "جيجل",           fr: "Jijel" },
    { code: "19", ar: "سطيف",           fr: "Sétif" },
    { code: "20", ar: "سعيدة",          fr: "Saïda" },
    { code: "21", ar: "سكيكدة",         fr: "Skikda" },
    { code: "22", ar: "سيدي بلعباس",    fr: "Sidi Bel Abbès" },
    { code: "23", ar: "عنابة",          fr: "Annaba" },
    { code: "24", ar: "قالمة",          fr: "Guelma" },
    { code: "25", ar: "قسنطينة",        fr: "Constantine" },
    { code: "26", ar: "المدية",         fr: "Médéa" },
    { code: "27", ar: "مستغانم",        fr: "Mostaganem" },
    { code: "28", ar: "المسيلة",        fr: "M'Sila" },
    { code: "29", ar: "معسكر",          fr: "Mascara" },
    { code: "30", ar: "ورقلة",          fr: "Ouargla" },
    { code: "31", ar: "وهران",          fr: "Oran" },
    { code: "32", ar: "البيض",          fr: "El Bayadh" },
    { code: "33", ar: "إليزي",          fr: "Illizi" },
    { code: "34", ar: "برج بوعريريج",   fr: "Bordj Bou Arréridj" },
    { code: "35", ar: "بومرداس",        fr: "Boumerdès" },
    { code: "36", ar: "الطارف",         fr: "El Tarf" },
    { code: "37", ar: "تندوف",          fr: "Tindouf" },
    { code: "38", ar: "تيسمسيلت",       fr: "Tissemsilt" },
    { code: "39", ar: "الوادي",         fr: "El Oued" },
    { code: "40", ar: "خنشلة",          fr: "Khenchela" },
    { code: "41", ar: "سوق أهراس",      fr: "Souk Ahras" },
    { code: "42", ar: "تيبازة",         fr: "Tipaza" },
    { code: "43", ar: "ميلة",           fr: "Mila" },
    { code: "44", ar: "عين الدفلى",     fr: "Aïn Defla" },
    { code: "45", ar: "النعامة",        fr: "Naâma" },
    { code: "46", ar: "عين تموشنت",     fr: "Aïn Témouchent" },
    { code: "47", ar: "غرداية",         fr: "Ghardaïa" },
    { code: "48", ar: "غليزان",         fr: "Relizane" },
    { code: "49", ar: "تيميمون",        fr: "Timimoun" },
    { code: "50", ar: "برج باجي مختار", fr: "Bordj Badji Mokhtar" },
    { code: "51", ar: "أولاد جلال",     fr: "Ouled Djellal" },
    { code: "52", ar: "بني عباس",       fr: "Béni Abbès" },
    { code: "53", ar: "إن صالح",        fr: "In Salah" },
    { code: "54", ar: "إن قزام",        fr: "In Guezzam" },
    { code: "55", ar: "تقرت",           fr: "Touggourt" },
    { code: "56", ar: "جانت",           fr: "Djanet" },
    { code: "57", ar: "المغير",         fr: "El M'Ghair" },
    { code: "58", ar: "المنيعة",        fr: "El Meniaa" }
  ];

  // ===================== المنطق الأساسي =====================
  function getLang() {
    try {
      var v = localStorage.getItem(LANG_KEY);
      return v === "fr" ? "fr" : "ar";
    } catch (_e) { return "ar"; }
  }

  function setLang(lang) {
    lang = lang === "fr" ? "fr" : "ar";
    try { localStorage.setItem(LANG_KEY, lang); } catch (_e) {}
    // إعادة تحميل الصفحة أبسط وأضمن طريقة لتطبيق اللغة على كل شيء
    // (نصوص ثابتة + منتجات + قوائم الولايات) دون أي خطر على منطق الطلبات.
    location.reload();
  }

  function toggleLang() {
    setLang(getLang() === "ar" ? "fr" : "ar");
  }

  function t(key) {
    var entry = UI_DICT[key];
    if (!entry) return key;
    var lang = getLang();
    return entry[lang] || entry.ar || key;
  }

  function applyStatic(root) {
    root = root || document;
    var lang = getLang();
    document.documentElement.setAttribute("lang", lang === "fr" ? "fr" : "ar");
    document.documentElement.setAttribute("dir", lang === "fr" ? "ltr" : "rtl");

    root.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (key) el.textContent = t(key);
    });
    root.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-ph");
      if (key) el.setAttribute("placeholder", t(key));
    });
    root.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-aria");
      if (key) el.setAttribute("aria-label", t(key));
    });
    root.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-title");
      if (key) el.setAttribute("title", t(key));
    });
  }

  // يرجع اسم منتج ووصفه حسب اللغة الحالية.
  // إن لم يملك المنتج name_fr/description_fr يبقى الاسم الأصلي كما هو (بدون أي ترجمة آلية).
  function translateProduct(p) {
    if (!p) return { name: "", description: "" };
    var lang = getLang();
    var name = p.name || t("default_product_name");
    var description = p.description || t("default_product_desc");
    if (lang === "fr") {
      if (p.name_fr && String(p.name_fr).trim()) name = p.name_fr;
      if (p.description_fr && String(p.description_fr).trim()) description = p.description_fr;
    }
    return { name: name, description: description };
  }

  function wilayaNameFor(code, lang) {
    lang = lang === "fr" ? "fr" : "ar";
    var w = WILAYAS.filter(function (x) { return x.code === code; })[0];
    if (!w) return "";
    return w[lang];
  }

  // نفس تنسيق قائمة <select> الأصلية "01 - أدرار" / "01 - Adrar"
  function wilayaOptionLabel(code, lang) {
    var name = wilayaNameFor(code, lang);
    return name ? (code + " - " + name) : code;
  }

  function formatMoney(n) {
    var lang = getLang();
    var num = Number(n) || 0;
    var localeStr = lang === "fr" ? num.toLocaleString("fr-FR") : num.toLocaleString("ar-DZ");
    return localeStr + " " + t("currency_suffix");
  }

  global.BazarI18n = {
    LANG_KEY: LANG_KEY,
    WILAYAS: WILAYAS,
    getLang: getLang,
    setLang: setLang,
    toggleLang: toggleLang,
    t: t,
    applyStatic: applyStatic,
    translateProduct: translateProduct,
    wilayaNameFor: wilayaNameFor,
    wilayaOptionLabel: wilayaOptionLabel,
    formatMoney: formatMoney
  };
})(window);
