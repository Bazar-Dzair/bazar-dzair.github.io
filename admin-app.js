// =============================================================
// Bazar Dzair — Admin Panel: منطق التطبيق الرئيسي (ES module)
// تم فصل هذا الملف من admin.html (كان داخل <script type="module">)
// بدون أي تعديل على المنطق — فقط نقل المحتوى لملف خارجي.
// السكريبتات من نوع module مؤجلة (deferred) دائمًا بشكل افتراضي، سواء
// كانت مضمّنة أو خارجية — فتوقيت التنفيذ يبقى نفسه بالضبط.
// =============================================================
import{initializeApp}from"https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import{getFirestore,collection,addDoc,updateDoc,deleteDoc,doc,onSnapshot,getDocs,serverTimestamp,setDoc,getDoc,writeBatch,deleteField,query,orderBy,limit,where,documentId}from"https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import{getAuth,signInWithEmailAndPassword,onAuthStateChanged,signOut}from"https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
// ملاحظة 17/09/2026: تم حذف import الخاص بـ Firebase Storage (getStorage/uploadBytes/...)
// من هنا لأنه لم يكن مستعملاً فعليًا فأي مكان — المشروع على خطة Spark المجانية بلا
// Firebase Storage، ورفع الصور (شعار/بانر/منتجات) يمر بالكامل عبر Cloudinary
// (دالة uploadToCloudinary أسفله). الإبقاء على import غير مستعمل كان يخلق وهمًا
// بأن storage.rules فعّال، بينما لم يكن كذلك.

const config={
apiKey:"AIzaSyBWdA_QIy_2gOBl-bP1S1tLaGIqaZjpar8",
authDomain:"bazar-dzair-33816.firebaseapp.com",
projectId:"bazar-dzair-33816",
storageBucket:"bazar-dzair-33816.firebasestorage.app",
messagingSenderId:"51073161969",
appId:"1:51073161969:web:cb75a3224bdca11ea8e750"};
const firebaseApp=initializeApp(config),db=getFirestore(firebaseApp),auth=getAuth(firebaseApp);
// 👁️ إحصائية "زوار اليوم" في لوحة التحكم: قراءة حيّة (onSnapshot) لمستند visits/{اليوم} الذي
// تكتبه صفحات الموقع (index.html و product.html). تُستدعى بعد تأكيد تسجيل دخول الأدمن فقط،
// لأن قواعد Firestore تمنع أي حساب آخر من قراءة هذه المجموعة.
let visitsStatUnsub=null;
function loadVisitsStat(){
  if(visitsStatUnsub)return;
  const today=new Date().toLocaleDateString("en-CA",{timeZone:"Africa/Algiers"});
  const el=document.getElementById("statVisitsToday");
  visitsStatUnsub=onSnapshot(doc(db,"visits",today),snap=>{
    if(el)el.textContent=((snap.exists()&&snap.data().count)||0).toLocaleString("ar-DZ");
  },e=>console.warn("Visits stat load failed",e));
}
// 📈 مخطط الزوار لآخر 14 يومًا: قراءة واحدة (وليست حيّة، لتفادي استهلاك بيانات إضافي) لكل
// مستندات visits التي معرّفها (YYYY-MM-DD) يقع ضمن آخر 14 يومًا، ثم رسمها كأعمدة SVG بسيطة
// بدون أي مكتبة خارجية (تجنبًا لتحميل سكربتات إضافية على اتصال بطيء أو متقطّع).
let visitsChartLoaded=false;
async function loadVisitsChart(){
  if(visitsChartLoaded)return;
  visitsChartLoaded=true;
  const box=document.getElementById("visitsChartBox");
  if(!box)return;
  const DAYS=14;
  const days=[];
  for(let i=DAYS-1;i>=0;i--){
    const d=new Date();
    d.setDate(d.getDate()-i);
    days.push(d.toLocaleDateString("en-CA",{timeZone:"Africa/Algiers"}));
  }
  const counts={};
  try{
    const snap=await getDocs(query(collection(db,"visits"),where(documentId(),">=",days[0]),orderBy(documentId())));
    snap.forEach(docSnap=>{counts[docSnap.id]=docSnap.data().count||0;});
  }catch(e){
    console.warn("Visits chart load failed",e);
    box.innerHTML='<small style="color:#c0392b">تعذّر تحميل بيانات الزوار.</small>';
    visitsChartLoaded=false;
    return;
  }
  const data=days.map(d=>({date:d,count:counts[d]||0}));
  const max=Math.max(1,...data.map(d=>d.count));
  const barW=28,gap=8,leftPad=6,h=140,chartH=96;
  const w=data.length*(barW+gap)+leftPad;
  const bars=data.map((d,i)=>{
    const bh=Math.max(d.count>0?2:0,Math.round((d.count/max)*chartH));
    const x=leftPad+i*(barW+gap);
    const y=chartH-bh+18;
    const label=d.date.slice(5).replace("-","/");
    return '<g><rect x="'+x+'" y="'+y+'" width="'+barW+'" height="'+bh+'" rx="4" fill="#7c5cf0"><title>'+d.date+': '+d.count+' زائر</title></rect>'+
      '<text x="'+(x+barW/2)+'" y="'+(y-4)+'" font-size="10" text-anchor="middle" fill="#374151">'+d.count+'</text>'+
      '<text x="'+(x+barW/2)+'" y="'+(chartH+32)+'" font-size="9" text-anchor="middle" fill="#9099a6">'+label+'</text></g>';
  }).join("");
  box.innerHTML='<svg viewBox="0 0 '+w+' '+h+'" width="'+w+'" height="'+h+'" style="min-width:'+w+'px">'+bars+'</svg>';
}
// 🖱️ لوحة "مشاهدات المنتجات": قراءة حيّة (onSnapshot) لمجموعة productViews التي يكتبها
// product.html في كل مرة يفتح فيها زبون صفحة منتج (انظر trackProductView هناك). تُستدعى
// بعد تأكيد تسجيل دخول الأدمن فقط، لأن قواعد Firestore تمنع أي حساب آخر من قراءتها.
let productViewsUnsub=null;
function loadProductViews(){
  if(productViewsUnsub)return;
  const box=document.getElementById("productViewsBox");
  if(!box)return;
  productViewsUnsub=onSnapshot(collection(db,"productViews"),snap=>{
    const rows=[];
    snap.forEach(docSnap=>{
      const d=docSnap.data()||{};
      rows.push({name:d.name||docSnap.id,count:Number(d.count)||0,updatedAt:d.updatedAt});
    });
    if(!rows.length){box.innerHTML='<small style="color:#9099a6">لا توجد مشاهدات مسجّلة بعد.</small>';return;}
    rows.sort((a,b)=>b.count-a.count);
    const trs=rows.map(r=>{
      const t=(r.updatedAt&&r.updatedAt.seconds)?new Date(r.updatedAt.seconds*1000).toLocaleString("ar-DZ",{timeZone:"Africa/Algiers"}):"—";
      return '<tr style="border-top:1px solid var(--line)"><td style="padding:8px">'+esc(r.name)+'</td><td style="padding:8px;font-weight:700">'+r.count.toLocaleString("ar-DZ")+'</td><td style="padding:8px;color:#9099a6;font-size:13px">'+t+'</td></tr>';
    }).join("");
    box.innerHTML='<table style="width:100%;border-collapse:collapse"><thead><tr style="text-align:right;color:#9099a6;font-size:13px"><th style="padding:6px 8px">المنتج</th><th style="padding:6px 8px">عدد المشاهدات</th><th style="padding:6px 8px">آخر مشاهدة</th></tr></thead><tbody>'+trs+'</tbody></table>';
  },e=>{console.warn("Product views load failed",e);box.innerHTML='<small style="color:#c0392b">تعذّر تحميل مشاهدات المنتجات.</small>';});
}
// نفس UID المستخدم فـ isAdmin() فـ firestore.rules/storage.rules. Firestore Rules هي خط
// الدفاع الحقيقي (أي طلب قراءة/كتابة من حساب غير هذا الـ UID يُرفض هناك مهما فعل الكود هنا)،
// لكن بدون هذا الفحص هنا كان أي حساب Firebase آخر (لو تم إنشاؤه، مثلاً عبر REST API
// لـ Identity Toolkit باستخدام apiKey العام لو كان تسجيل حسابات جديدة مفعّلاً فمشروع
// Firebase) يقدر يسجّل دخول ويشوف هيكل لوحة التحكم كاملاً (حتى لو كل القراءات فشلت
// بـ permission-denied) — تسريب غير ضروري لبنية اللوحة لأي حساب غير الأدمن.
const ADMIN_UID="GOBngnCP2eMTLZrJpf72GOmXvvO2";
window.bazarDb=db;window.bazarDoc=doc;window.bazarSetDoc=setDoc;window.bazarGetDoc=getDoc;window.bazarServerTimestamp=serverTimestamp;window.bazarAuth=auth;
// إتاحة دوال رفع Cloudinary/ضغط الصور (معرّفة أدناه فنفس هذا الـ module) للـ <script>
// العادي الأول فالصفحة (لي فيه uploadBrandFile) — السكربتات من نوع module لها نطاق
// خاص بها ولا تشارك المتغيرات تلقائيًا مع سكربت عادي آخر.
window.bazarUploadToCloudinary=uploadToCloudinary;window.bazarCompressImage=compressImageToBlob;

// ===== رفع الصور عبر Cloudinary (خطة Free دائمة، بدون اشتراك أو بطاقة بنكية) =====
// Firebase Storage يتطلب خطة Blaze (اشتراك مربوط ببطاقة) من Google منذ فبراير 2026، لذلك تم
// استبداله بـ Cloudinary (Unsigned Upload Preset — لا حاجة لأي مفتاح سري في الكود).
// ملاحظة: CLOUDINARY_CLOUD_NAME/CLOUDINARY_UPLOAD_PRESET انتقلا لـ admin-config.js
// (مُعرَّفين بـ var هناك ليصبحا خاصية window يشوفها هذا الـmodule بلا أي تغيير هنا).
async function uploadToCloudinary(blob){
  // محاولات متعددة لأن الاتصال (H+/4G) قد ينقطع أثناء الرفع فيظهر "Failed to fetch"
  let lastErr;
  for(let attempt=1;attempt<=3;attempt++){
    const fd=new FormData();
    fd.append("file",blob);
    fd.append("upload_preset",CLOUDINARY_UPLOAD_PRESET);
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),45000);
    try{
      const res=await fetch("https://api.cloudinary.com/v1_1/"+CLOUDINARY_CLOUD_NAME+"/image/upload",{method:"POST",body:fd,signal:controller.signal});
      let json;
      try{ json=await res.json(); }catch(_e){ throw new Error("رد غير صالح من خدمة رفع الصور."); }
      if(!res.ok||!json||!json.secure_url){
        // خطأ من Cloudinary نفسه (preset غير موجود/غير Unsigned...) — إعادة المحاولة لن تفيد
        const err=new Error(json&&json.error&&json.error.message?json.error.message:("فشل الرفع (HTTP "+res.status+"). تحقق من إعدادات Cloudinary (Cloud name / Upload preset)."));
        err.fatal=true; throw err;
      }
      return json.secure_url;
    }catch(e){
      if(e.fatal) throw e;
      lastErr=e;
      if(attempt<3) await new Promise(r=>setTimeout(r,1500*attempt));
    }finally{ clearTimeout(timeout); }
  }
  if(lastErr&&lastErr.name==="AbortError") throw new Error("انتهت مهلة رفع الصورة. الاتصال ضعيف — جرّب صورة أصغر أو أعد المحاولة، أو ضع رابط الصورة مباشرة.");
  throw new Error("تعذر الوصول لخدمة رفع الصور (Cloudinary). تحقق من الإنترنت أو جرّب شبكة أخرى، أو ضع رابط الصورة مباشرة في خانة الرابط.");
}

const loginBox=document.getElementById("login");
const appBox=document.getElementById("app");
const emailInput=document.getElementById("email");
const passwordInput=document.getElementById("password");
const loginErrBox=document.getElementById("loginErr");
const nameInput=document.getElementById("name");
const nameFrInput=document.getElementById("name_fr");
const skuInput=document.getElementById("sku");
const priceInput=document.getElementById("price");
const oldPriceInput=document.getElementById("oldPrice");
const categoryInput=document.getElementById("category");
const stockInput=document.getElementById("stock");
const showOldPriceInput=document.getElementById("showOldPrice");
const showReviewsInput=document.getElementById("showReviews");
const publishedInput=document.getElementById("published");
const featuredInput=document.getElementById("featured");
const descriptionInput=document.getElementById("description");
const descriptionFrInput=document.getElementById("description_fr");
const specificationsText=document.getElementById("specificationsText");
const featuresText=document.getElementById("featuresText");
const titleBox=document.getElementById("title");
const statusBox=document.getElementById("status");
const listBox=document.getElementById("list");
const searchInput=document.getElementById("search");
const imagePreviewBox=document.getElementById("imagePreview");
const imageFilesInput=document.getElementById("imageFiles");
const imageCountBox=document.getElementById("imageCount");
const shippingHomeSelect=document.getElementById("shippingHomeSelect");
const shippingOfficeSelect=document.getElementById("shippingOfficeSelect");
(function initProductShippingMenus(){
  const homeMenu=document.getElementById("shippingHomeMenu");
  const officeMenu=document.getElementById("shippingOfficeMenu");
  if(homeMenu) homeMenu.innerHTML=Object.entries(homeCompanyLabels).map(([v,l])=>carrierOptionHtml(v,l,false)).join("");
  if(officeMenu) officeMenu.innerHTML=Object.entries(officeCompanyLabels).map(([v,l])=>carrierOptionHtml(v,l,false)).join("");
})();
// ===== طريقة التوصيل داخل "إنشاء منتج" — اختيار واحد فقط: باب الدار أو المكتب =====
// عند اختيار "باب الدار" تظهر فقط شركات باب الدار، وعند اختيار "المكتب" تظهر فقط شركات المكتب.
const deliveryMethodHomeRadio=document.getElementById("deliveryMethodHome");
const deliveryMethodOfficeRadio=document.getElementById("deliveryMethodOffice");
const deliveryMethodHomeFields=document.getElementById("deliveryMethodHomeFields");
const deliveryMethodOfficeFields=document.getElementById("deliveryMethodOfficeFields");
window.updateDeliveryMethodUI=function(){
  const isOffice=!!(deliveryMethodOfficeRadio&&deliveryMethodOfficeRadio.checked);
  if(deliveryMethodHomeFields) deliveryMethodHomeFields.style.display=isOffice?"none":"block";
  if(deliveryMethodOfficeFields) deliveryMethodOfficeFields.style.display=isOffice?"block":"none";
};
function currentDeliveryMethod(){
  return (deliveryMethodOfficeRadio&&deliveryMethodOfficeRadio.checked)?"office":"home";
}
function setDeliveryMethod(method){
  const isOffice=method==="office";
  if(deliveryMethodHomeRadio) deliveryMethodHomeRadio.checked=!isOffice;
  if(deliveryMethodOfficeRadio) deliveryMethodOfficeRadio.checked=isOffice;
  window.updateDeliveryMethodUI();
}
window.updateDeliveryMethodUI();
function setMultiSelectValue(wrap,val){
  if(!wrap)return;
  const codes=new Set(String(val||"").split(",").map(v=>v.trim()).filter(Boolean));
  wrap.dataset.value=[...codes].join(",");
  wrap.classList.toggle("empty",!codes.size);
  wrap.querySelectorAll('input[type="checkbox"]').forEach(cb=>{cb.checked=codes.has(cb.value);});
  const btn=wrap.querySelector(".multi-select-btn");
  if(btn) btn.textContent=homeCompanyDisplay([...codes].join(","));
}
let products=[],editing=null;
let productsPage=1, ordersPage=1;
let lowStockFilter=false;
const ITEMS_PER_PAGE=10;
const selectedProducts=new Set(), selectedOrders=new Set();
let orderSearchQuery="", orderStatusFilter="all";
function money(n){return Number(n||0).toLocaleString("ar-DZ")+" دج"}
function pad2(n){return String(n).padStart(2,"0")}
function orderDisplayId(o){if(o&&o.orderSeq)return "#"+String(o.orderSeq).padStart(4,"0");return "#"+String(o?.id||"").slice(-6).toUpperCase()}
function orderDateObj(o){
  const c=o?.createdAt; if(!c) return null;
  if(typeof c.toDate==="function") return c.toDate();
  if(c.seconds!=null) return new Date(c.seconds*1000);
  if(typeof c==="string"||c instanceof Date){const d=new Date(c);return isNaN(d)?null:d;}
  return null;
}
function orderListDate(o){const d=orderDateObj(o);return d?(d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate())):"—"}
function orderListTime(o){const d=orderDateObj(o);return d?(pad2(d.getHours())+":"+pad2(d.getMinutes())):""}
function orderDetailDateTime(o){const d=orderDateObj(o);return d?(pad2(d.getDate())+"/"+pad2(d.getMonth()+1)+"/"+d.getFullYear()+" - "+pad2(d.getHours())+":"+pad2(d.getMinutes())):"—"}
function orderStatusClass(status){
  const s=String(status||"").trim();
  if(s==="مكتملة") return "st-completed";
  if(s==="ملغية") return "st-cancelled";
  if(s==="قيد المعالجة") return "st-processing";
  return "st-new";
}
function findOrderProductImage(name){
  const p=(products||[]).find(x=>String(x.name||"").trim()===String(name||"").trim());
  if(!p) return "";
  return (Array.isArray(p.images)&&p.images[0])||p.image||p.imageUrl||p.photo||"";
}
function toast(t,c){
  const box=document.getElementById("ordersToast"); if(!box)return;
  box.textContent=t; box.className="toast-msg show"+(c?(" "+c):"");
  clearTimeout(window.__ordersToastTimer);
  window.__ordersToastTimer=setTimeout(()=>{box.className="toast-msg";},2600);
}
let selectedImages=[]; // {file,url,existing}
let saving=false;
const saveBtn=document.getElementById("saveBtn");

// ===== مصدر واحد للمنتجات =====
// `products` (هذه الـ module scope) هو المرجع الوحيد. كل العمليات
// (إضافة/تعديل/حذف/عرض/إحصائيات) تقرأ منه، فلا يحدث تعارض أو undefined.
function updateStats(){
  if(typeof productsLoaded!=="undefined" && !productsLoaded)return;
  const list=Array.isArray(products)?products:[];
  const values={
    statProducts:list.length,
    statPublished:list.filter(p=>p.published!==false).length,
    statLowStock:list.filter(p=>Number(p.stock||0)<=5).length,
    statInventory:list.reduce((sum,p)=>sum+Math.max(0,Number(p.stock||0)),0)
  };
  Object.entries(values).forEach(([id,value])=>{
    const el=document.getElementById(id);
    if(el)el.textContent=Number(value).toLocaleString("ar-DZ");
  });
}
function updateOrderStats(count){
  const el=document.getElementById("statOrders");
  if(el)el.textContent=Number(count||0).toLocaleString("ar-DZ");
  const n=Number(count||0);
  const badge=document.getElementById("bellBadge");
  if(badge){badge.textContent=n>99?"99+":n;badge.classList.toggle("hidden",n<=0);}
}

let dashboardStatsLoaded=false;
window.bazarLoadDashboardStats=async function(force=false){
  if(dashboardStatsLoaded && !force) return;
  try{
    const snap=window.adminOrders?{docs:window.adminOrders.map(o=>({data:()=>o}))}:await getDocs(collection(db,"orders"));
    const orders=snap.docs.map(d=>d.data());
    updateOrderStats(orders.length);
    const phones=new Set(orders.map(o=>String(o.phone||o.customerPhone||o.tel||"").trim()).filter(Boolean));
    const custEl=document.getElementById("statCustomers");
    if(custEl) custEl.textContent=(phones.size||orders.length).toLocaleString("ar-DZ");
    dashboardStatsLoaded=true;
  }catch(e){ console.error("dashboard stats failed",e); }
};

const defaultCategories=[
  {key:"tools",name:"أدوات",name_fr:"Outils",icon:"🔧"},{key:"home",name:"المطبخ والمنزل",name_fr:"Maison et cuisine",icon:"🏠"},{key:"electronics",name:"أكسسوارات وإلكترونيات",name_fr:"Accessoires et électronique",icon:"⚡"},{key:"phones",name:"هواتف",name_fr:"Téléphones",icon:"📱"},{key:"laptops",name:"حاسوب محمول",name_fr:"Ordinateurs portables",icon:"💻"},{key:"clothes",name:"ملابس وأحذية",name_fr:"Vêtements et chaussures",icon:"👕"},{key:"beauty",name:"صحة وجمال",name_fr:"Santé et beauté",icon:"✨"},{key:"women",name:"معدات نسوية",name_fr:"Équipements femme",icon:"👩"},{key:"jewelry",name:"مجوهرات وإكسسوارات نسائية",name_fr:"Bijoux et accessoires femme",icon:"💎"},{key:"baby",name:"مستلزمات الأطفال والرضع",name_fr:"Articles pour bébés",icon:"🧸"},{key:"medical",name:"أدوات طبية",name_fr:"Matériel médical",icon:"🩺"},{key:"carparts",name:"قطع غيار السيارات",name_fr:"Pièces détachées automobiles",icon:"🚗"},{key:"summer",name:"منتجات الصيف",name_fr:"Produits d'été",icon:"☀️"},{key:"shaving",name:"آلات الحلاقة",name_fr:"Machines à raser",icon:"🪒"},{key:"gifts",name:"هدايا متنوعة",name_fr:"Idées cadeaux",icon:"🎁"},{key:"library",name:"مكتبة",name_fr:"Librairie",icon:"📚"},{key:"realestate",name:"عقارات وأراضي",name_fr:"Immobilier et terrains",icon:"🏡"},{key:"clearance",name:"تصفية مخزون",name_fr:"Déstockage",icon:"🏷️"},{key:"misc",name:"منتجات متنوعة",name_fr:"Produits divers",icon:"🛍️"}
];
let categories=[];
function categoryIconFor(name){
  const n=String(name||"").toLowerCase();
  const rules=[[/سيارات|قطع غيار|auto|car/,'🚗'],[/هاتف|هواتف|mobile|phone/,'📱'],[/حاسوب|كمبيوتر|لابتوب|laptop|computer/,'💻'],[/إلكترون|الكترون|accessor/,'⚡'],[/أدوات|tool/,'🔧'],[/منزل|مطبخ|home|kitchen/,'🏠'],[/ملابس|أحذية|clothes|shoes/,'👕'],[/جمال|صحة|beauty/,'✨'],[/نساء|نسوية|woman|women/,'👩'],[/مجوهر|jewelry/,'💎'],[/أطفال|رضع|baby|kids/,'🧸'],[/طبية|medical/,'🩺'],[/صيف|summer/,'☀️'],[/حلاقة|shav/,'🪒'],[/هدايا|gift/,'🎁'],[/مكتبة|كتب|book/,'📚'],[/عقار|أراضي|real estate|land/,'🏡'],[/تصفية|clearance/,'🏷️']];
  for(const [re,ic] of rules)if(re.test(n))return ic; return '🛍️';
}
function normalizeCategoryList(list){const map=new Map();(Array.isArray(list)?list:[]).forEach(c=>{const key=String(c.key||"").trim(),name=String(c.name||"").trim();if(!key||!name||map.has(key))return;map.set(key,{key,name,name_fr:String(c.name_fr||"").trim(),slug:String(c.slug||"").trim(),icon:String(c.icon||categoryIconFor(name)),hidden:c.hidden===true,description:String(c.description||"").trim(),description_fr:String(c.description_fr||"").trim()});});return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,"ar"));}

/* توحيد التصنيفات المكررة مثل: أدوات / أدوات-2 / هواتف / هواتف-2،
   وكذلك التصنيفات المكررة بنفس الاسم مع اختلاف حالة الأحرف أو المسافات
   الزائدة (Tools / tools / "  Tools  "). يتم الاحتفاظ بنسخة واحدة فقط
   (التصنيف الأساسي)، ونقل المنتجات المرتبطة بالنسخ المكررة إلى التصنيف
   الأساسي قبل حذف النسخ المكررة فعليًا من مصدر البيانات (Firestore). */
function categoryCollapseSpaces(s){
  return String(s||"").trim().replace(/\s+/g," ");
}
function categoryBaseName(name){
  return categoryCollapseSpaces(name)
    .replace(/(?:\s*[-–—]\s*|\s*_\s*|\s*\()([2-9]\d*)\)?$/u,"")
    .trim();
}
function categoryBaseKey(key){
  return String(key||"").trim().toLowerCase().replace(/(?:[-_]\d+)$/,"");
}
// مقارنة "منطقية" للاسم تتجاهل المسافات الزائدة واختلاف حالة الأحرف،
// تُستخدم لاكتشاف التكرار سواء عند الحفظ أو عند توحيد التصنيفات القديمة.
function categoryNameSignature(name){
  return categoryCollapseSpaces(categoryBaseName(name)).toLowerCase();
}
async function consolidateDuplicateCategories(snap){
  const raw=(snap?.docs||[]).map(d=>({key:d.id,name:categoryCollapseSpaces(d.data()?.name||""),icon:String(d.data()?.icon||"")}))
    .filter(c=>c.key&&c.name);
  const byName=new Map();
  raw.forEach(c=>{
    const sig=categoryNameSignature(c.name);
    if(!byName.has(sig))byName.set(sig,[]);
    byName.get(sig).push(c);
  });
  let changed=false;
  for(const [sig,items] of byName){
    if(items.length<2)continue;
    // اختيار نسخة أساسية ثابتة دائمًا (لا نتخطى أي مجموعة مكررة): نُفضّل
    // اسمًا بلا لاحقة رقمية ومعرّفًا بلا لاحقة رقمية، وإلا نأخذ الأقدم أبجديًا.
    const sorted=[...items].sort((a,b)=>a.key.localeCompare(b.key));
    const canonical=sorted.find(c=>categoryBaseName(c.name)===c.name && categoryBaseKey(c.key)===c.key.toLowerCase())
      ||sorted.find(c=>categoryBaseName(c.name)===c.name)
      ||sorted.find(c=>categoryBaseKey(c.key)===c.key.toLowerCase())
      ||sorted[0];
    const duplicates=items.filter(c=>c.key!==canonical.key);
    if(!duplicates.length)continue;
    try{
      // حذف صريح وبدون أي دمج/إعادة تعيين لفئة المنتجات: المنتجات التابعة
      // للفئات المكررة تبقى كما هي (لن تُنسَب إلى النسخة المحتفَظ بها).
      for(const dup of duplicates){
        await deleteDoc(doc(db,"categories",dup.key));
        changed=true;
      }
    }catch(e){
      console.error("category duplicate migration",e);
    }
  }
  return changed ? await getDocs(collection(db,"categories")) : snap;
}

imageFilesInput?.addEventListener("change",()=>{
  const incoming=[...imageFilesInput.files],available=10-selectedImages.length;
  if(incoming.length>available)show("يمكن إضافة 10 صور فقط للمنتج.","err");
  incoming.slice(0,Math.max(0,available)).forEach(file=>{if(!file.type.startsWith("image/"))return;selectedImages.push({file,url:URL.createObjectURL(file),existing:false});});
  imageFilesInput.value="";renderSelectedImages();
});

window.login=async()=>{const e=emailInput.value.trim(),p=passwordInput.value;loginErrBox.classList.add("hidden");if(!e||!p){loginErrBox.textContent="اكتب البريد الإلكتروني وكلمة المرور.";loginErrBox.classList.remove("hidden");return}try{await signInWithEmailAndPassword(auth,e,p)}catch(x){console.error("Firebase login error:",x);loginErrBox.textContent="فشل الدخول: "+(x.code==="auth/invalid-credential"||x.code==="auth/wrong-password"||x.code==="auth/user-not-found"?"البريد أو كلمة المرور غير صحيحة.":x.message);loginErrBox.classList.remove("hidden")}};
window.logout=()=>signOut(auth);
onAuthStateChanged(auth,u=>{document.body.classList.remove("auth-check");
  // 👁️ علامة bazarIsAdmin: تمنع صفحات الموقع (index.html و product.html) من احتساب
  // زيارات الأدمن نفسه ضمن إحصائية "زوار اليوم". تُوضع فقط لحساب الأدمن الحقيقي (ADMIN_UID)
  // وتُزال عند الخروج أو عند دخول حساب غير مصرّح له.
  if(u && u.uid!==ADMIN_UID){
    // حساب Firebase صحيح لكن ليس حساب الأدمن — لا نعرض حتى هيكل اللوحة، نسجّل خروجه فورًا.
    console.error("Auth: non-admin account signed in, forcing sign-out:",u.uid);
    try{localStorage.removeItem("bazarIsAdmin");}catch(e){}
    signOut(auth);
    appBox.classList.add("hidden");loginBox.classList.remove("hidden");
    loginErrBox.textContent="هذا الحساب غير مصرّح له بالدخول إلى لوحة التحكم.";loginErrBox.classList.remove("hidden");
    return;
  }
  try{if(u)localStorage.setItem("bazarIsAdmin","1");else localStorage.removeItem("bazarIsAdmin");}catch(e){}
  if(u){loginBox.classList.add("hidden");appPage();renderCategorySelect();renderCategories();loadCategories();renderCurrentUser(u);if(window.bazarLoadReviews)window.bazarLoadReviews();if(window.bazarLoadFraudAlerts)window.bazarLoadFraudAlerts(true);loadVisitsStat();loadVisitsChart();loadProductViews();try{const cachedCount=localStorage.getItem("bazarProductsCount"),pc=document.getElementById("statProducts");if(pc&&cachedCount)pc.textContent=Number(cachedCount).toLocaleString("ar-DZ")}catch(e){}}else{appBox.classList.add("hidden");loginBox.classList.remove("hidden")}});

// الرابط الثابت للتصنيف (/product-category/<slug>/): نفس ترتيب الأولوية في index.html و scripts/generate_static_products.py.
// slug المحفوظ أولًا (لا يتغيّر بتعديل الاسم)، وإلا الاشتقاق القديم من name_fr ثم المعرّف.
function categorySlugOf(c){return frSlug(c&&c.slug)||frSlug(c&&c.name_fr)||frSlug(c&&c.key)||"categorie";}
function categoryKeySafe(value){return String(value||"").trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^\p{L}\p{N}\-_]+/gu,"-").replace(/^-+|-+$/g,"");}
function renderCategorySelect(selectedValue){if(!categoryInput)return;const current=selectedValue!==undefined?String(selectedValue):String(categoryInput.value||"");categoryInput.innerHTML=categories.map(c=>`<option value="${esc(c.key)}">${esc(c.icon||"🛍️")} ${esc(c.name)}</option>`).join("");if(categories.some(c=>String(c.key)===current))categoryInput.value=current;else if(categories.length)categoryInput.value=categories[0].key;}
function renderCategories(){const box=document.getElementById("categoriesList");if(!box)return;if(!categories.length){box.innerHTML='<div class="empty-card">لا توجد فئات حاليًا.<br><button class="edit-cat" type="button" style="margin-top:10px" onclick="window.restoreDefaultCategories()">🔄 استعادة الفئات الافتراضية</button><br><small style="color:#888">أضف فئة جديدة بنفسك، أو اضغط الزر أعلاه لاستعادة القائمة الجاهزة — لا شيء يُضاف تلقائيًا بلا ضغطك على الزر.</small></div>';renderCategorySelect("");return}box.innerHTML=categories.map(c=>`<div class="category-row"${c.hidden?' style="opacity:.55"':''}><div class="category-info"><span class="category-icon">${esc(c.icon||"🛍️")}</span><div><b>${esc(c.name)}${c.hidden?' <span style="font-weight:400;font-size:11px;color:#c62828">(مخفية)</span>':''}</b>${c.name_fr?`<small style="display:block;color:#888">FR: ${esc(c.name_fr)}</small>`:''}<small>${esc(c.key)}</small><small dir="ltr" style="display:block;color:#888">/product-category/${esc(categorySlugOf(c))}/</small></div></div><div class="category-actions"><button class="edit-cat" type="button" style="${c.hidden?'background:#eafaf0;color:#1a7d3c':'background:#fff7e6;color:#a15c00'}" onclick="toggleCategoryVisibility('${esc(c.key)}')">${c.hidden?'👁️ إظهار':'🙈 إخفاء'}</button><button class="edit-cat" type="button" onclick="editCategory('${esc(c.key)}')">✏️ تعديل</button><button class="delete-cat" type="button" onclick="deleteCategory('${esc(c.key)}')">🗑️ حذف</button></div></div>`).join("");renderCategorySelect(categoryInput?.value||"");}
window.toggleCategoryVisibility=async key=>{const c=categories.find(x=>String(x.key)===String(key));if(!c)return;const newHidden=!c.hidden;try{await setDoc(doc(db,"categories",key),{hidden:newHidden,updatedAt:serverTimestamp()},{merge:true});await loadCategories()}catch(e){console.error(e);alert("تعذر تحديث حالة الفئة: "+(e.message||"خطأ غير معروف"))}};
// ⚠️ إصلاح: كانت هذه الدالة تُستدعى تلقائيًا من loadCategories() في كل مرة تُفتح
// فيها لوحة التحكم، وتعيد زرع الفئات الافتراضية بمجرد ما تصبح قائمة الفئات فارغة —
// حتى لو أفرغتها أنت عمدًا بالحذف اليدوي. علامة الحماية settings/categories.initialized
// كانت مفروضة تمنع هذا بعد أول مرة، لكن لو فشل حفظها ولو لمرة واحدة (فشل شبكة، إلخ)
// تبقى "غير مُهيّأة" للأبد، فتتكرر إعادة الزرع من جديد في كل مرة تصبح القائمة فارغة.
// الإصلاح: لا نزرع أي شيء تلقائيًا بتاتًا بعد الآن — فقط بضغطة صريحة من الأدمن على
// الزر في الحالة الفارغة (renderCategories)، وحتى عند الضغط لا نكتب فوق أي فئة
// موجودة أصلًا بنفس المعرّف (تفاديًا لأي ازدواجية).
window.restoreDefaultCategories=async function(){
  if(!confirm(`سيتم إضافة ${defaultCategories.length} فئة افتراضية (لن تُستبدل أي فئة موجودة حاليًا). متابعة؟`))return;
  try{
    const snap=await getDocs(collection(db,"categories"));
    const existingKeys=new Set(snap.docs.map(d=>d.id));
    let added=0;
    for(const c of defaultCategories){
      if(existingKeys.has(c.key))continue;
      await setDoc(doc(db,"categories",c.key),{name:c.name,name_fr:c.name_fr||"",slug:frSlug(c.name_fr)||frSlug(c.key),icon:c.icon,createdAt:serverTimestamp(),updatedAt:serverTimestamp()},{merge:false});
      added++;
    }
    await loadCategories();
    show(added?`تمت إضافة ${added} فئة ✅`:"كل الفئات الافتراضية موجودة أصلًا","ok");
  }catch(e){console.error(e);alert("تعذرت استعادة الفئات: "+(e.message||"خطأ غير معروف"))}
};
async function loadCategories(){const box=document.getElementById("categoriesList");try{let snap=await getDocs(collection(db,"categories"));snap=await consolidateDuplicateCategories(snap);categories=normalizeCategoryList(snap.docs.map(d=>({key:d.id,...(d.data()||{})})));renderCategories()}catch(e){console.error("categories load",e);categories=[];if(box)box.innerHTML='<div class="empty-card">❌ تعذر تحميل التصنيفات. تحقق من اتصال Firebase والصلاحيات.</div>'}}
window.openCategoryForm=()=>{document.getElementById("categoryForm")?.classList.remove("hidden");document.getElementById("categoryId").value="";document.getElementById("categoryName").value="";document.getElementById("categoryNameFr").value="";document.getElementById("categoryKey").value="";document.getElementById("categoryIcon").value="🛍️";document.getElementById("categoryDescription").value="";document.getElementById("categoryDescriptionFr").value="";document.getElementById("categoryName").focus()};
window.closeCategoryForm=()=>document.getElementById("categoryForm")?.classList.add("hidden");
window.editCategory=key=>{const c=categories.find(x=>String(x.key)===String(key));if(!c)return;document.getElementById("categoryForm")?.classList.remove("hidden");document.getElementById("categoryId").value=c.key;document.getElementById("categoryName").value=c.name||"";document.getElementById("categoryNameFr").value=c.name_fr||"";document.getElementById("categoryKey").value=c.key||"";document.getElementById("categoryIcon").value=c.icon||categoryIconFor(c.name);document.getElementById("categoryDescription").value=c.description||"";document.getElementById("categoryDescriptionFr").value=c.description_fr||"";document.getElementById("categoryName").focus()};
window.saveCategory=async()=>{const oldKey=document.getElementById("categoryId").value.trim(),name=document.getElementById("categoryName").value.trim(),name_fr=document.getElementById("categoryNameFr").value.trim(),key=categoryKeySafe(document.getElementById("categoryKey").value.trim()||name),icon=document.getElementById("categoryIcon").value.trim()||categoryIconFor(name),description=document.getElementById("categoryDescription").value.trim(),description_fr=document.getElementById("categoryDescriptionFr").value.trim(),status=document.getElementById("categoryStatus");if(!name||!key){if(status){status.textContent="اكتب اسم الفئة والمعرّف.";status.className="status err"}return}try{const existing=await getDoc(doc(db,"categories",key));if(existing.exists()&&key!==oldKey){if(status){status.textContent="هذا المعرّف موجود مسبقًا. اختر معرّفًا آخر.";status.className="status err"}return}
  const all=await getDocs(collection(db,"categories"));
  const sig=categoryNameSignature(name);
  const duplicate=all.docs.map(d=>({key:d.id,name:String(d.data()?.name||"").trim()}))
    .find(c=>c.key!==oldKey&&categoryNameSignature(c.name)===sig&&c.name);
  if(duplicate){if(status){status.textContent=`يوجد تصنيف بنفس الاسم: «${duplicate.name}». تم منع التكرار.`;status.className="status err"}return}
  // ===== الرابط الثابت للتصنيف =====
  // يُحسب مرة واحدة ثم يُخزَّن في الحقل slug ولا يتغيّر بعدها حتى لو عُدّل الاسم الفرنسي أو المعرّف:
  // الرابط /product-category/<slug>/ يبقى واحدًا وثابتًا (SEO)، والاسم المعروض هو الذي يتبدّل حسب اللغة.
  // فئة موجودة: نُثبّت رابطها الحالي (من قيمها القديمة قبل هذا التعديل). فئة جديدة: من الاسم الفرنسي ثم المعرّف.
  const selfId=oldKey||key;
  const prevDoc=all.docs.find(d=>d.id===selfId);
  let slug=prevDoc?categorySlugOf({key:prevDoc.id,...(prevDoc.data()||{})}):(frSlug(name_fr)||frSlug(key)||"categorie");
  if(slug==="categorie")slug=""; // لا أصل لاتيني بعد: لا نُثبّت رابطًا عامًا، يُشتق لاحقًا عند إضافة الاسم الفرنسي
  else if(!prevDoc){
    const takenSlugs=new Set(all.docs.filter(d=>d.id!==selfId).map(d=>categorySlugOf({key:d.id,...(d.data()||{})})));
    if(takenSlugs.has(slug)){let n=2;while(takenSlugs.has(slug+"-"+n))n++;slug=slug+"-"+n;}
  }
  if(oldKey&&oldKey!==key){await setDoc(doc(db,"categories",key),{name,name_fr,slug,icon,description,description_fr,updatedAt:serverTimestamp()},{merge:false});const ps=await getDocs(collection(db,"products"));await Promise.all(ps.docs.filter(d=>String(d.data()?.category||"")===oldKey).map(d=>updateDoc(d.ref,{category:key,updatedAt:serverTimestamp()})));await deleteDoc(doc(db,"categories",oldKey))}else await setDoc(doc(db,"categories",key),{name,name_fr,slug,icon,description,description_fr,updatedAt:serverTimestamp()},{merge:true});await loadCategories();closeCategoryForm();if(status){status.textContent="تم حفظ الفئة بنجاح ✅";status.className="status ok"}}catch(e){console.error(e);if(status){status.textContent="تعذر حفظ الفئة: "+(e.message||"خطأ غير معروف");status.className="status err"}}};
window.deleteCategory=async key=>{const c=categories.find(x=>String(x.key)===String(key));if(!c||!confirm("حذف الفئة «"+c.name+"»؟\nلن يتم حذف أو تعديل المنتجات التابعة لها (تبقى محتفظة بربطها القديم بهذه الفئة حتى تُعاد تصنيفها يدويًا)."))return;try{
  // ⚠️ إصلاح: كانت هذه الدالة تحذف الفئة ثم تمسح (category:"") من كل المنتجات
  // المرتبطة بها — وهو نوع من إعادة التعيين رفضه المستخدم صراحة سابقًا لدالة
  // consolidateDuplicateCategories(). طبّقنا نفس المبدأ هنا: حذف صِرف للفئة فقط،
  // بلا أي لمس لحقل category في المنتجات.
  await deleteDoc(doc(db,"categories",key));await loadCategories()}catch(e){console.error(e);alert("تعذر حذف الفئة: "+(e.message||"خطأ غير معروف"))}};



const homeSectionDefaults=[
  {key:"hero",name:"البانر الرئيسي",desc:"عرض البانر والعروض الرئيسية في واجهة المتجر",enabled:true},
  {key:"categories",name:"التصنيفات",desc:"عرض تصنيفات المنتجات للزوار",enabled:true},
  {key:"featured",name:"منتجات مميزة",desc:"إظهار المنتجات التي تختارها كمنتجات مميزة",enabled:true},
  {key:"latest",name:"أحدث المنتجات",desc:"عرض آخر المنتجات المضافة",enabled:true},
  {key:"footer",name:"تذييل المتجر",desc:"عرض معلومات وروابط التذييل",enabled:true}
];
async function loadHomeSections(){
  const box=document.getElementById("sectionsAdmin"); if(!box)return;
  let data={}; try{data=await getRemoteSetting("homeSections");}catch(e){}
  const saved=Array.isArray(data.sections)?data.sections:[];
  const map=Object.fromEntries(saved.map(x=>[x.key,x]));
  box.innerHTML=homeSectionDefaults.map(s=>{
    const x=map[s.key]||s;
    const icon=s.key==="hero"?"🖼":s.key==="categories"?"▦":s.key==="featured"?"⭐":s.key==="latest"?"🛍":"▤";
    return `<div class="section-admin-row"><div class="section-admin-icon">${icon}</div><div class="section-admin-text"><b>${s.name}</b><small>${s.desc}</small></div><label class="switch"><input type="checkbox" data-section="${s.key}" ${x.enabled!==false?"checked":""}><span></span></label></div>`;
  }).join("");
}
async function saveHomeSections(){
  const sections=[...document.querySelectorAll("#sectionsAdmin [data-section]")].map(el=>{
    const base=homeSectionDefaults.find(x=>x.key===el.dataset.section);
    return {key:base.key,name:base.name,desc:base.desc,enabled:el.checked};
  });
  try{await setDoc(doc(db,"settings","homeSections"),{sections,updatedAt:serverTimestamp()},{merge:true});show("تم حفظ أقسام المتجر بنجاح ✅","ok");}
  catch(e){show("تعذر حفظ الأقسام: "+(e.message||"خطأ غير معروف"),"err");}
}
window.loadHomeSections=loadHomeSections; window.saveHomeSections=saveHomeSections;

function renderCurrentUser(u){
  const email=u?.email||"غير متوفر", uid=u?.uid||"", box=document.getElementById("userProfileCard"); if(!box)return;
  box.innerHTML=`<div class="user-profile-head"><div class="user-avatar">${esc((email[0]||"A").toUpperCase())}</div><div><h3>${esc(email)}</h3><span>حساب مسؤول اللوحة</span></div></div><div class="user-info-grid"><div><small>البريد الإلكتروني</small><b dir="ltr">${esc(email)}</b></div><div><small>معرّف الحساب</small><b dir="ltr">${esc(uid)}</b></div><div><small>الحالة</small><b class="user-online">● متصل الآن</b></div></div>`;
}

function appPage(){
  appBox.classList.remove("hidden");
  let view="dashboard";
  try{
    const params=new URLSearchParams(window.location.search);
    view=params.get("view")||sessionStorage.getItem("bazarAdminView")||"dashboard";
  }catch(e){}
  const valid=["dashboard","orders","product","products","categories","shipping-rates","sections","footer","users","settings","addons","order-detail","blocked","fraud"];
  if(!valid.includes(view)) view="dashboard";
  const nav=[...document.querySelectorAll(".nav-item")];
  const ordersNavItem=document.querySelector('.nav-item[onclick*="orders"]');
  // إعادة تحميل الصفحة وهي على "تفاصيل الطلبية" (مثلاً بعد نسخ الرابط أو تحديث المتصفح):
  // نفس منطق popstate — نعرض تفاصيل الطلبية إن كانت محمّلة، وإلا نرجع لقائمة الطلبات
  // بدل السقوط الصامت إلى لوحة التحكم وفقدان السياق.
  if(view==="order-detail"){
    const oid=new URLSearchParams(window.location.search).get("order");
    const o=(window.adminOrders||[]).find(x=>x.id===oid);
    if(o){ renderOrderDetail(o); showView("order-detail",ordersNavItem,false,false); }
    else { showView("orders",ordersNavItem,false,false); }
    return;
  }
  const navItem=document.querySelector('.nav-item[data-view="'+view+'"]');
  // صفحة إنشاء/تعديل المنتج: إن لم يوجد معرّف منتج (لا في الرابط ولا في الجلسة)
  // فهذه صفحة "إنشاء منتج جديد" ويجب أن تبدأ فارغة تمامًا.
  let createNew=false;
  if(view==="product"){
    try{
      const hasId=!!new URLSearchParams(window.location.search).get("id")||!!sessionStorage.getItem("bazarEditingProduct");
      createNew=!hasId;
    }catch(e){createNew=true;}
  }
  showView(view,navItem||nav[0],createNew,false);
}
let productsLoaded=false;
let productsLoading=null;
let ordersLoaded=false;
let ordersLoading=null;
let addonsLoaded=false;

// يحوّل صور المنتجات القديمة إلى صور مرفوعة على Cloudinary (مجاني، بدون اشتراك)،
// تلقائيًا وبدون إعادة رفع يدوي. يشمل هذا نوعين من الصور «القديمة»:
// 1) صور مخزّنة كـ base64 داخل Firestore مباشرة.
// 2) صور برابط خارجي ليس من Cloudinary (مثلاً i.ibb.co من خدمة رفع قديمة) —
//    كانت هذه الحالة تُعتبر خطأً "رابطًا جاهزًا" ولا تُمس أبدًا، وهو السبب الجذري
//    في بقاء بعض صور صفحات التصنيف موزّعة بين ibb.co و Cloudinary إلى الأبد.
// توحيد كل صور المنتجات على Cloudinary وحده يتيح لاحقًا تفعيل التحويل التلقائي
// لأخف صيغة يدعمها المتصفح (WebP/AVIF) وبالحجم المناسب، وهو غير ممكن مع ibb.co.
// لا يمس أي منتج صوره أصلاً روابط Cloudinary جاهزة.
window.migrateBase64Images=async function(){
  const statusEl=document.getElementById("migrateStatus");
  const setStatus=(t,c)=>{if(statusEl){statusEl.textContent=t;statusEl.style.color=c==="err"?"#dc2626":c==="ok"?"#16a34a":"#374151"}};
  if(!confirm("سيتم فحص كل المنتجات وتحويل الصور القديمة (base64 أو روابط من خدمات أخرى مثل ibb.co) إلى روابط Cloudinary موحّدة. لن يتم المساس بالصور المرفوعة أصلاً على Cloudinary. بعض الروابط الخارجية قد يفشل جلبها تلقائيًا بسبب حماية الموقع المصدر (CORS)، وستظهر في تقرير النتيجة دون التأثير على بقية المنتجات. متابعة؟"))return;
  setStatus("⏳ جاري فحص المنتجات...","");
  let snap;
  try{ snap=await getDocs(collection(db,"products")); }
  catch(e){ setStatus("تعذر تحميل المنتجات: "+(e?.message||"خطأ غير معروف"),"err"); return; }

  let fixedProducts=0, fixedImages=0, failed=0, consecutiveFailures=0;
  for(const d of snap.docs){
    const p=d.data();
    const imgs=Array.isArray(p.images)&&p.images.length?p.images.slice():(p.image?[p.image]:[]);
    if(!imgs.length) continue;
    const isBase64=s=>typeof s==="string"&&s.startsWith("data:");
    const isCloudinaryUrl=s=>typeof s==="string"&&/^https?:\/\/res\.cloudinary\.com\//i.test(s);
    const needsMigration=s=>isBase64(s)||(typeof s==="string"&&/^https?:\/\//i.test(s)&&!isCloudinaryUrl(s));
    if(!imgs.some(needsMigration)) continue; // كل الصور مرفوعة أصلاً على Cloudinary

    setStatus(`⏳ جاري إصلاح: ${p.name||p.product||d.id}...`,"");
    const newImgs=imgs.slice();
    let anyFailedHere=false;
    for(let i=0;i<newImgs.length;i++){
      if(!needsMigration(newImgs[i])) continue;
      try{
        const blob=await (await fetch(newImgs[i])).blob();
        newImgs[i]=await uploadToCloudinary(blob);
        fixedImages++;
        consecutiveFailures=0;
      }catch(e){
        console.error("migrate image failed",d.id,i,e);
        anyFailedHere=true;
        consecutiveFailures++;
        setStatus(`⚠️ فشل في "${p.name||p.product||d.id}": ${e?.message||"خطأ غير معروف"}`,"err");
        if(consecutiveFailures>=3){
          setStatus(`⚠️ توقف الإصلاح: 3 محاولات رفع فشلت تباعًا (${e?.message||"خطأ غير معروف"}). تحقق من إعدادات Cloudinary ثم أعد المحاولة.`,"err");
          return;
        }
      }
    }
    if(anyFailedHere)failed++;
    try{
      await updateDoc(doc(db,"products",d.id),{images:newImgs,image:newImgs[0]||"",updatedAt:serverTimestamp()});
      fixedProducts++;
    }catch(e){
      console.error("update product failed",d.id,e);
      failed++;
    }
  }
  productsLoaded=false;
  await window.bazarLoadProducts(true);
  if(failed) setStatus(`تم إصلاح ${fixedProducts} منتج (${fixedImages} صورة). فشل جزء من العملية في ${failed} حالة — السبب الغالب هو حماية الموقع المصدر (CORS) لبعض الروابط الخارجية؛ أعد المحاولة، أو استبدل صورة هذا المنتج يدويًا من نافذة تعديل المنتج.`,"err");
  else if(fixedProducts) setStatus(`✅ تم إصلاح ${fixedProducts} منتج (${fixedImages} صورة) بنجاح — كل صور المنتجات موحّدة الآن على Cloudinary. الآن شغّل GitHub Action لإعادة توليد صفحات SEO.`,"ok");
  else setStatus("✅ لا توجد صور قديمة — كل الصور موحّدة أصلاً على Cloudinary.","ok");
};

// يضيف حقل "slug" لكل منتج قديم لا يملكه بعد (أو كان غير مطابق للاسم الحالي)،
// حتى تتمكن صفحة المنتج (product.html) من جلب المنتج بقراءة وثيقة واحدة مباشرة
// عبر استعلام على slug، بدل تحميل مجموعة products كاملة عند كل زيارة. عملية تُشغَّل
// مرة واحدة (أو كلما رغبت)؛ لا تمس أي حقل آخر في المنتج.
window.migrateProductSlugs=async function(){
  const statusEl=document.getElementById("migrateStatus");
  const setStatus=(t,c)=>{if(statusEl){statusEl.textContent=t;statusEl.style.color=c==="err"?"#dc2626":c==="ok"?"#16a34a":"#374151"}};
  if(!confirm("سيتم فحص كل المنتجات وإضافة/تصحيح حقل الرابط المباشر (slug) للمنتجات التي لا تملكه. لن يتم المساس بأي بيانات أخرى للمنتج. متابعة؟"))return;
  setStatus("⏳ جاري فحص المنتجات...","");
  let snap;
  try{ snap=await getDocs(collection(db,"products")); }
  catch(e){ setStatus("تعذر تحميل المنتجات: "+(e?.message||"خطأ غير معروف"),"err"); return; }

  let fixed=0, failed=0;
  for(const d of snap.docs){
    const p=d.data();
    const correctSlug=productSlugOf({...p,id:d.id});
    if(p.slug===correctSlug) continue; // محدَّث أصلاً
    setStatus(`⏳ جاري إصلاح: ${p.name||p.product||d.id}...`,"");
    try{
      await updateDoc(doc(db,"products",d.id),{slug:correctSlug,updatedAt:serverTimestamp()});
      fixed++;
    }catch(e){
      console.error("slug migration failed",d.id,e);
      failed++;
    }
  }
  productsLoaded=false;
  await window.bazarLoadProducts(true);
  if(failed) setStatus(`تم إصلاح رابط ${fixed} منتج. فشل جزء من العملية في ${failed} حالة — أعد المحاولة.`,"err");
  else if(fixed) setStatus(`✅ تم إصلاح رابط ${fixed} منتج بنجاح. الآن كل زيارة لصفحة منتج تقرأ وثيقته مباشرة بدل المجموعة كاملة.`,"ok");
  else setStatus("✅ كل المنتجات تملك رابطًا (slug) صحيحًا أصلاً.","ok");
};

window.bazarLoadProducts=async function(force=false){
  if(productsLoading)return productsLoading;
  if(productsLoaded&&!force){ render(); return; }
  const box=listBox;
  if(box && !productsLoaded){box.innerHTML='<div class="empty-card"><span class="empty-icon">⏳</span><b>جاري تحميل المنتجات...</b><span>يتم تحميل البيانات عند فتح قسم المنتجات فقط.</span></div>';}
  productsLoading=(async()=>{
    try{
      const snap=await getDocs(collection(db,"products"));
      products=snap.docs.map(d=>({id:d.id,...d.data()}));
      productsLoaded=true;
      const productCounter=document.getElementById("statProducts");
      if(productCounter)productCounter.textContent=snap.size.toLocaleString("ar-DZ");
      render();updateStats();
      try{
        localStorage.setItem("bazarProductsCount",String(snap.size));
      }catch(e){}
      try{
        const editId=sessionStorage.getItem("bazarEditingProduct");
        const view=sessionStorage.getItem("bazarAdminView");
        if(editId && view==="product" && !editing){
          const p=products.find(x=>x.id===editId);
          if(p)window.editProduct(editId); else sessionStorage.removeItem("bazarEditingProduct");
        }
      }catch(e){}
    }catch(e){
      console.error("products load",e);
      if(box)box.innerHTML='<div class="empty-card">❌ تعذر تحميل المنتجات. تحقق من اتصال Firebase والصلاحيات.</div>';
    }finally{productsLoading=null;}
  })();
  return productsLoading;
};

window.bazarLoadOrders=async function(force=false){
  if(ordersLoading)return ordersLoading;
  if(ordersLoaded&&!force){renderOrders();return;}
  const box=document.getElementById("orders");
  if(!box)return;
  box.innerHTML='<div class="empty-card">⏳ جاري تحميل الطلبات...</div>';
  ordersLoading=(async()=>{
    try{
      const snap=await getDocs(collection(db,"orders"));
      updateOrderStats(snap.size);
      window.adminOrders=snap.docs.map(d=>({id:d.id,...(d.data()||{})}));
      const ascByDate=[...window.adminOrders].sort((a,b)=>{const ta=a.createdAt?.seconds||0,tb=b.createdAt?.seconds||0;return ta-tb;});
      ascByDate.forEach((o,i)=>{o.orderSeq=i+1;});
      window.adminOrders.sort((a,b)=>{const ta=a.createdAt?.seconds||0,tb=b.createdAt?.seconds||0;return tb-ta;});
      ordersLoaded=true;
      ordersPage=1; selectedOrders.clear(); renderOrders();
      if(window.bazarLoadBlockedIps && !blockedIpsLoaded) window.bazarLoadBlockedIps().then(()=>{ if(document.getElementById("view-orders")&&!document.getElementById("view-orders").classList.contains("hidden")) renderOrders(); }).catch(()=>{});
      if(window.bazarLoadProducts && !productsLoaded){
        window.bazarLoadProducts().then(()=>{ if(document.getElementById("view-orders")&&!document.getElementById("view-orders").classList.contains("hidden")) renderOrders(); }).catch(()=>{});
      }
    }catch(e){console.error(e);updateOrderStats(0);box.innerHTML='<div class="empty-card">❌ تعذر قراءة الطلبات من Firestore. تحقق من Firestore Rules.</div>';
    }finally{ordersLoading=null;}
  })();
  return ordersLoading;
};

function getFilteredOrders(){
  const q=String(orderSearchQuery||"").trim().toLowerCase();
  const rows=Array.isArray(window.adminOrders)?window.adminOrders:[];
  return rows.filter(o=>{
    if(orderStatusFilter!=="all"){
      const s=String(o.status||"جديد").trim();
      if(orderStatusFilter==="قيد المعالجة"){ if(s==="مكتملة"||s==="ملغية") return false; }
      else if(s!==orderStatusFilter) return false;
    }
    if(!q) return true;
    const hay=[orderDisplayId(o),o.id,o.customerName,o.name,o.customerPhone,o.phone,o.product].map(v=>String(v||"").toLowerCase()).join(" ");
    return hay.includes(q);
  });
}
function renderOrdersStats(all){
  const total=all.length;
  const completed=all.filter(o=>String(o.status||"")==="مكتملة").length;
  const cancelled=all.filter(o=>String(o.status||"")==="ملغية").length;
  const processing=Math.max(0,total-completed-cancelled);
  const set=(id,v)=>{const el=document.getElementById(id); if(el) el.textContent=Number(v).toLocaleString("ar-DZ");};
  set("ordersStatTotal",total); set("ordersStatCompleted",completed); set("ordersStatCancelled",cancelled); set("ordersStatProcessing",processing);
}
function renderOrders(){
  const box=document.getElementById("orders"); if(!box)return;
  const all=Array.isArray(window.adminOrders)?window.adminOrders:[];
  renderOrdersStats(all);
  const rows=getFilteredOrders();
  const totalPages=Math.max(1,Math.ceil(rows.length/ITEMS_PER_PAGE));
  if(ordersPage>totalPages)ordersPage=totalPages;
  if(!rows.length){
    box.innerHTML = all.length
      ? '<div class="empty-card">🔎<b>لا توجد نتائج مطابقة</b><span>جرّب تعديل البحث أو الفلتر.</span></div>'
      : '<div class="empty-card">🛒<b>لا توجد طلبات</b><span>عند وصول طلب جديد سيظهر هنا.</span></div>';
    renderPagination("ordersPagination",1,0,"ordersPage"); updateBulkUi("orders"); return;
  }
  const start=(ordersPage-1)*ITEMS_PER_PAGE, pageRows=rows.slice(start,start+ITEMS_PER_PAGE);
  const ipCounts=orderIpCounts(all);
  box.innerHTML=pageRows.map(o=>{
    const img=findOrderProductImage(o.product);
    const statusTxt=String(o.status||"جديد");
    const ipN=o.ip?normalizeIp(o.ip):null;
    const ipCnt=ipN?(ipCounts[ipN.key]||1):0;
    const ipBlocked=!!(ipN&&blockedIpKeys.has(ipN.key));
    const ipBtn=ipN?`<button class="icon-action-btn" title="${ipBlocked?"هذا الـ IP محظور":esc("حظر IP الزبون ("+ipN.display+")"+(ipCnt>1?" — "+ipCnt+" طلبات من نفس الـ IP":""))}" type="button" ${ipBlocked?'style="opacity:.45"':""} onclick="window.blockOrderIp('${esc(o.id)}')">🌐${ipCnt>1?`<sup style="color:#c62828;font-weight:800">${ipCnt}</sup>`:""}</button>`:"";
    return `<div class="order-row-pro" style="cursor:pointer" onclick="window.openOrderDetail('${esc(o.id)}')">
      <div class="order-cell oc-select" onclick="event.stopPropagation()"><label class="item-check"><input type="checkbox" ${selectedOrders.has(o.id)?"checked":""} onchange="window.toggleOrderSelection('${esc(o.id)}',this.checked)"></label></div>
      <div class="order-cell oc-num">${esc(orderDisplayId(o))}</div>
      <div class="order-cell oc-customer">${esc(o.customerName||o.name||"غير متوفر")}${riskBadgeHtml(o)}</div>
      <div class="order-cell oc-product"><div class="order-product-cell">${img?`<img class="order-product-img" src="${esc(img)}" onerror="this.style.display='none'">`:`<span class="order-product-img ph">📦</span>`}<div><span class="order-product-name">${esc(o.product||"منتج غير محدد")}</span>${o.variant?`<br><small style="color:#7c8798">🎨 ${esc(o.variant)}</small>`:""}</div></div></div>
      <div class="order-cell oc-qty">${Number(o.quantity||1)}</div>
      <div class="order-cell oc-total">${money(o.total)}</div>
      <div class="order-cell oc-status"><span class="order-status-badge bd-badge ${orderStatusClass(statusTxt)}">${esc(statusTxt)}</span></div>
      <div class="order-cell oc-date"><div class="order-date-cell"><b>${orderListDate(o)}</b><span>${orderListTime(o)}</span></div></div>
      <div class="order-cell oc-actions" onclick="event.stopPropagation()"><div class="order-actions-cell">
        <button class="icon-action-btn view-icon" title="عرض الطلبية" type="button" onclick="window.openOrderDetail('${esc(o.id)}')">👁</button>
        <button class="icon-action-btn" title="حظر رقم الزبون + عنوان IP" type="button" onclick="window.blockOrderPhoneAndIp('${esc(o.id)}')">🚫</button>
        ${ipBtn}
        <button class="icon-action-btn delete-icon" title="حذف" type="button" onclick="deleteOrder('${esc(o.id)}')">🗑</button>
      </div></div>
    </div>`;
  }).join("");
  renderPagination("ordersPagination",ordersPage,totalPages,"ordersPage"); updateBulkUi("orders");
}
window.__ordersSearchInput=function(v){ orderSearchQuery=v; ordersPage=1; renderOrders(); };
window.toggleOrdersFilterMenu=function(){ document.getElementById("ordersFilterMenu")?.classList.toggle("hidden"); };
window.setOrderStatusFilter=function(status){
  orderStatusFilter=status; ordersPage=1;
  document.querySelectorAll("#ordersFilterMenu button").forEach(b=>b.classList.toggle("active",b.dataset.status===status));
  document.getElementById("ordersFilterMenu")?.classList.add("hidden");
  const btn=document.getElementById("ordersFilterBtn"); if(btn) btn.classList.toggle("active",status!=="all");
  renderOrders();
};
document.addEventListener("click",(e)=>{
  const menu=document.getElementById("ordersFilterMenu");
  if(menu && !menu.classList.contains("hidden") && !e.target.closest(".orders-filter-wrap")) menu.classList.add("hidden");
});
window.applyBulkStatus=async function(){
  const sel=document.getElementById("bulkStatusSelect");
  const status=sel?.value; if(!status){toast("اختر الحالة الجديدة أولاً","err");return;}
  const ids=[...selectedOrders]; if(!ids.length){toast("اختر طلبية واحدة على الأقل","err");return;}
  if(!confirm(`تغيير حالة ${ids.length} طلبية إلى "${status}"؟`))return;
  try{
    const tokens={};
    await Promise.all(ids.map(id=>{
      const cur=(window.adminOrders||[]).find(o=>o.id===id);
      const extra=bazarReviewTokenFields(cur,status);
      if(extra.reviewToken) tokens[id]=extra.reviewToken;
      return updateDoc(doc(db,"orders",id),{status,updatedAt:serverTimestamp(),...extra});
    }));
    window.adminOrders=(window.adminOrders||[]).map(o=>selectedOrders.has(o.id)?{...o,status,...(tokens[o.id]?{reviewToken:tokens[o.id],reviewUsed:false}:{})}:o);
    toast(`تم تحديث حالة ${ids.length} طلبية ✅`,"ok");
    renderOrders();
  }catch(e){console.error(e);toast("تعذر تحديث الحالة: "+(e.message||"خطأ غير معروف"),"err");}
  finally{ if(sel) sel.value=""; }
};
window.openOrderDetail=function(id){
  const o=(window.adminOrders||[]).find(x=>x.id===id);
  if(!o){toast("تعذر العثور على الطلبية","err");return;}
  renderOrderDetail(o);
  showView("order-detail",document.querySelector('.nav-item[onclick*="orders"]'));
  try{
    const url=new URL(window.location.href);
    url.searchParams.set("view","order-detail"); url.searchParams.set("order",id);
    window.history.pushState({adminView:"order-detail",orderId:id},"",url.pathname+url.search+url.hash);
  }catch(e){}
};
window.backToOrders=function(){ showView("orders",document.querySelector('.nav-item[onclick*="orders"]')); };
function renderOrderDetail(o){
  window.__detailOrderId=o.id;
  const ipN=o.ip?normalizeIp(o.ip):null;
  if(ipN&&!blockedIpsLoaded&&!blockedIpsTried){
    blockedIpsTried=true;
    window.bazarLoadBlockedIps().then(()=>{ if(window.__detailOrderId===o.id) renderOrderDetail(o); }).catch(()=>{});
  }
  const ipRows=ipN?(()=>{
    const cnt=orderIpCounts(window.adminOrders||[])[ipN.key]||1;
    const blocked=blockedIpKeys.has(ipN.key);
    return `<div class="order-detail-row"><span>عنوان IP</span><span dir="ltr">${esc(ipN.display)}${o.country?` · ${esc(o.country)}`:""} ${blocked?'<b style="color:#c62828">محظور ✅</b>':`<button class="edit-cat" type="button" style="margin-inline-start:8px" onclick="window.blockOrderIp('${esc(o.id)}')">🚫 حظر</button>`}</span></div>`
      +(cnt>1?`<div class="order-detail-row"><span>طلبات من نفس الـ IP</span><span style="color:#c62828">${cnt}</span></div>`:"");
  })():"";
  const infoBox=document.getElementById("orderDetailInfo");
  const custBox=document.getElementById("orderDetailCustomer");
  const prodBox=document.getElementById("orderDetailProducts");
  const notesBox=document.getElementById("orderDetailNotes");
  if(infoBox) infoBox.innerHTML=`
    <div class="order-detail-row"><span>رقم الطلب</span><span>${esc(orderDisplayId(o))}</span></div>
    <div class="order-detail-row"><span>تاريخ الطلب</span><span>${orderDetailDateTime(o)}</span></div>
    <div class="order-detail-row"><span>الحالة</span><span><select class="order-status-select-detail" onchange="window.setOrderStatus('${esc(o.id)}',this.value)">
      ${["جديد","قيد المعالجة","مكتملة","ملغية"].map(s=>`<option value="${esc(s)}" ${String(o.status||"جديد")===s?"selected":""}>${esc(s)}</option>`).join("")}
    </select></span></div>
    ${(()=>{
      if(String(o.status||"")!=="مكتملة") return "";
      if(!o.productId) return `<div class="order-detail-row"><span>تقييم الزبون</span><span style="color:#8a93a3">غير متاح (الطلب بدون معرّف منتج)</span></div>`;
      if(o.reviewUsed===true) return `<div class="order-detail-row"><span>تقييم الزبون</span><b style="color:#16a34a">تم إرسال التقييم ✅</b></div>`;
      if(!o.reviewToken) return `<div class="order-detail-row"><span>تقييم الزبون</span><button class="edit-cat" type="button" onclick="window.setOrderStatus('${esc(o.id)}','مكتملة')">⭐ توليد رابط التقييم</button></div>`;
      const wa=bazarReviewWaUrl(o);
      return `<div class="order-detail-row"><span>رابط التقييم</span><span style="display:flex;gap:6px;flex-wrap:wrap"><button class="edit-cat" type="button" onclick="window.copyReviewLink('${esc(o.id)}')">📋 نسخ الرابط</button>${wa?`<a class="edit-cat" style="text-decoration:none" href="${esc(wa)}" target="_blank" rel="noopener">💬 واتساب</a>`:""}</span></div>`;
    })()}
    <div class="order-detail-row"><span>طريقة الدفع</span><span>الدفع عند الاستلام</span></div>
    <div class="order-detail-row"><span>المجموع الكلي</span><span style="color:var(--green)">${money(o.total)}</span></div>
  `;
  if(custBox) custBox.innerHTML=`
    <div class="order-detail-row"><span>الاسم الكامل</span><span>${esc(o.customerName||o.name||"غير متوفر")}</span></div>
    <div class="order-detail-row"><span>رقم الهاتف</span><span>${esc(o.customerPhone||o.phone||"غير متوفر")} <button class="edit-cat" type="button" style="margin-inline-start:8px" onclick="window.blockOrderPhoneAndIp('${esc(o.id)}')">🚫 حظر الهاتف${o.ip?" + IP":""}</button></span></div>
    ${o.wilaya?`<div class="order-detail-row"><span>الولاية</span><span>${esc(o.wilaya)}</span></div>`:""}
    ${o.address?`<div class="order-detail-row"><span>العنوان</span><span>${esc(o.address)}</span></div>`:""}
    ${ipRows}
    ${riskDetailRows(o)}
  `;
  const img=findOrderProductImage(o.product);
  const lineTotal=Number(o.price||0)*Number(o.quantity||1);
  if(prodBox) prodBox.innerHTML=`
    <table class="order-products-table"><thead><tr><th>المنتج</th><th>السعر</th><th>الكمية</th><th>المجموع</th></tr></thead>
    <tbody><tr>
      <td><div class="order-product-line">${img?`<img class="order-product-img" src="${esc(img)}" onerror="this.style.display='none'">`:`<span class="order-product-img ph">📦</span>`}<div><span class="order-product-name">${esc(o.product||"منتج غير محدد")}</span>${o.variant?`<br><small style="color:#7c8798">🎨 ${esc(o.variant)}</small>`:""}</div></div></td>
      <td>${money(o.price)}</td>
      <td>${Number(o.quantity||1)}</td>
      <td>${money(lineTotal)}</td>
    </tr></tbody></table>
    <div class="order-products-total"><span>مصاريف التوصيل</span><span>${money(o.shipping)}</span></div>
    <div class="order-products-total"><span>المجموع الكلي</span><b>${money(o.total)}</b></div>
  `;
  if(notesBox) notesBox.textContent = o.notes ? String(o.notes) : "لا توجد ملاحظات على هذا الطلب";
}
// ===== رابط تقييم المشتري الموثّق =====
// عند اكتمال الطلب يُولَّد رمز عشوائي (128 بت) لمرة واحدة ويُخزَّن داخل وثيقة الطلب (orders يقرؤها الأدمن وحده).
// الرابط يُرسَل للزبون؛ الـ Worker (/submit-review) هو من يتحقق من الرمز ويستهلكه، ولا يقدر أحد تخمينه.
function bazarNewReviewToken(){
  const a=new Uint8Array(16); crypto.getRandomValues(a);
  return [...a].map(b=>b.toString(16).padStart(2,"0")).join("");
}
// يُرجع الحقول الإضافية التي يجب حفظها مع تغيير الحالة (رمز جديد فقط إن لم يوجد ولديه productId).
function bazarReviewTokenFields(o,status){
  if(status!=="مكتملة"||!o||!o.productId||o.reviewToken) return {};
  return {reviewToken:bazarNewReviewToken(),reviewUsed:false,reviewTokenAt:serverTimestamp()};
}
function bazarReviewLink(o){
  if(!o||!o.reviewToken||!o.productId) return "";
  return location.origin+"/product.html?id="+encodeURIComponent(o.productId)+"&review="+encodeURIComponent(o.reviewToken);
}
function bazarReviewWaUrl(o){
  const link=bazarReviewLink(o); if(!link) return "";
  let ph=String(o.customerPhone||o.phone||"").replace(/\D/g,"");
  if(/^0[5-7]\d{8}$/.test(ph)) ph="213"+ph.slice(1); else return "";
  const name=String(o.customerName||"").trim();
  const msg=(name?"مرحبًا "+name+"،\n":"")+"شكرًا لثقتك في Bazar Dzair 🙏\nيسعدنا رأيك في المنتج الذي استلمته ("+String(o.product||"").slice(0,80)+"):\n"+link;
  return "https://wa.me/"+ph+"?text="+encodeURIComponent(msg);
}
window.copyReviewLink=async function(id){
  const o=(window.adminOrders||[]).find(x=>x.id===id); const link=bazarReviewLink(o);
  if(!link){toast("لا يوجد رابط تقييم لهذه الطلبية","err");return;}
  try{await navigator.clipboard.writeText(link);toast("تم نسخ رابط التقييم ✅","ok");}
  catch(e){window.prompt("انسخ الرابط:",link);}
};
window.setOrderStatus=async function(id,status){
  try{
    const cur=(window.adminOrders||[]).find(o=>o.id===id);
    const extra=bazarReviewTokenFields(cur,status);
    await updateDoc(doc(db,"orders",id),{status,updatedAt:serverTimestamp(),...extra});
    const localExtra=extra.reviewToken?{reviewToken:extra.reviewToken,reviewUsed:false}:{};
    window.adminOrders=(window.adminOrders||[]).map(o=>o.id===id?{...o,status,...localExtra}:o);
    toast("تم تحديث حالة الطلبية ✅","ok");
    if(window.__detailOrderId===id){const u=(window.adminOrders||[]).find(o=>o.id===id); if(u) renderOrderDetail(u);}
  }catch(e){console.error(e);toast("تعذر تحديث الحالة: "+(e.message||"خطأ غير معروف"),"err");}
};

window.__adminGoPage=function(type,page){
  const n=Math.max(1,Number(page)||1);
  if(type==="products"){productsPage=n;render();return;}
  if(type==="orders"){ordersPage=n;renderOrders();return;}
};

// ===== حذف التقييمات اليدوية القديمة من كل المنتجات دفعة واحدة =====
// تحذف من وثائق products الحقول: reviewRating, reviewCount (الأرقام اليدوية) وأي تقييم/مراجعة قديمة مخزّنة داخل المنتج
// (aggregateRating, rating, ratingValue, ratingCount, reviews). لا تمسّ مجموعة reviews (تقييمات الزبائن الحقيقية) ولا خيار showReviews.
const LEGACY_RATING_KEYS=["reviewRating","reviewCount","aggregateRating","rating","ratingValue","ratingCount","reviews"];
window.wipeOldManualRatings=async function(){
  if(!confirm("سيتم حذف كل التقييمات اليدوية القديمة (الرقم والعدد وأي مراجعة قديمة) من كل المنتجات نهائيًا. لن تتأثر تقييمات الزبائن الحقيقية ولا ميزة التقييمات الجديدة. متابعة؟")) return;
  try{
    const snap=await getDocs(collection(db,"products"));
    const targets=snap.docs.filter(d=>{const x=d.data()||{}; return LEGACY_RATING_KEYS.some(k=>x[k]!==undefined);});
    if(!targets.length){ toast("لا توجد تقييمات يدوية قديمة لحذفها ✅","ok"); return; }
    const upd={}; LEGACY_RATING_KEYS.forEach(k=>{upd[k]=deleteField();});
    const chunkSize=400; // حد أقصى آمن لكل دفعة Firestore (500)
    for(let i=0;i<targets.length;i+=chunkSize){
      const batch=writeBatch(db);
      targets.slice(i,i+chunkSize).forEach(d=>batch.update(doc(db,"products",d.id),upd));
      await batch.commit();
    }
    toast(`تم حذف التقييمات اليدوية من ${targets.length} منتج ✅`,"ok");
    productsLoaded=false; // لإجبار إعادة تحميل قائمة المنتجات بالأرقام المحدثة
  }catch(e){console.error(e);toast("تعذر حذف التقييمات اليدوية: "+(e.message||"خطأ غير معروف"),"err");}
};

// ===== التقييمات: تقييمات حقيقية فقط، كل تقييم جديد من الزبون يصل بحالة =====
// "قيد المراجعة" (approved:false) ولا يظهر فصفحة المنتج إلا بعد الموافقة هنا.
let reviewsAll=[], reviewsLoaded=false, reviewsLoading=null;
let reviewsPage=1, reviewsStatusFilter="pending", reviewsSearchQuery="";
window.bazarLoadReviews=async function(force=false){
  if(reviewsLoading) return reviewsLoading;
  if(reviewsLoaded && !force){ renderReviews(); return; }
  reviewsLoading=(async()=>{
    try{
      const snap=await getDocs(collection(db,"reviews"));
      reviewsAll=snap.docs.map(d=>({id:d.id,...(d.data()||{})}));
      reviewsAll.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
      reviewsLoaded=true;
      renderReviews();
    }catch(e){
      console.error(e);
      const box=document.getElementById("reviewsList");
      if(box) box.innerHTML='<div class="empty-card">❌ تعذر قراءة التقييمات من Firestore. تحقق من Firestore Rules.</div>';
    }finally{ reviewsLoading=null; }
  })();
  return reviewsLoading;
};
function getFilteredReviews(){
  const q=String(reviewsSearchQuery||"").trim().toLowerCase();
  return reviewsAll.filter(r=>{
    if(reviewsStatusFilter==="pending" && r.approved===true) return false;
    if(reviewsStatusFilter==="approved" && r.approved!==true) return false;
    if(!q) return true;
    const hay=[r.authorName,r.productName,r.text].map(v=>String(v||"").toLowerCase()).join(" ");
    return hay.includes(q);
  });
}
function renderReviewsStats(){
  const total=reviewsAll.length;
  const pending=reviewsAll.filter(r=>r.approved!==true).length;
  const approved=total-pending;
  const set=(id,v)=>{const el=document.getElementById(id); if(el) el.textContent=Number(v).toLocaleString("ar-DZ");};
  set("reviewsStatTotal",total); set("reviewsStatPending",pending); set("reviewsStatApproved",approved);
  const badge=document.getElementById("reviewsPendingBadge");
  if(badge){ if(pending>0){ badge.textContent=pending>99?"99+":String(pending); badge.classList.remove("hidden"); } else badge.classList.add("hidden"); }
}
function reviewStarsHtml(v){const n=Math.max(0,Math.min(5,Math.round(Number(v)||0)));return "★".repeat(n)+"☆".repeat(5-n);}
function reviewDateStr(r){ return r.createdAt?.seconds ? new Date(r.createdAt.seconds*1000).toLocaleDateString("ar-DZ") : ""; }
function renderReviews(){
  const box=document.getElementById("reviewsList"); if(!box)return;
  renderReviewsStats();
  const rows=getFilteredReviews();
  const totalPages=Math.max(1,Math.ceil(rows.length/ITEMS_PER_PAGE));
  if(reviewsPage>totalPages) reviewsPage=totalPages;
  if(!rows.length){
    box.innerHTML = reviewsAll.length
      ? '<div class="empty-card">🔎<b>لا توجد نتائج مطابقة</b><span>جرّب تعديل البحث أو الفلتر.</span></div>'
      : '<div class="empty-card">⭐<b>لا توجد تقييمات بعد</b><span>عند إضافة زبون لتقييم جديد سيظهر هنا.</span></div>';
    renderReviewsPagination(1,0); return;
  }
  const start=(reviewsPage-1)*ITEMS_PER_PAGE, pageRows=rows.slice(start,start+ITEMS_PER_PAGE);
  box.innerHTML='<div class="reviews-list">'+pageRows.map(r=>{
    const approved=r.approved===true;
    return `<div class="review-row">
      <div class="review-row-top">
        <div class="review-row-who">
          <span class="review-row-name">${esc(String(r.authorName||"زبون"))}</span>
          <span class="review-row-stars">${reviewStarsHtml(r.ratingValue)}</span>
          ${r.productName?`<span class="review-row-product">— ${esc(String(r.productName))}</span>`:""}
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="review-row-status ${approved?'approved':'pending'}">${approved?'منشور ✅':'قيد المراجعة ⏳'}</span>
          <span class="review-row-date">${esc(reviewDateStr(r))}</span>
        </div>
      </div>
      <div class="review-row-text">${esc(String(r.text||""))}</div>
      <div class="review-row-actions">
        ${approved
          ?`<button type="button" class="review-unapprove" onclick="window.unapproveReview('${esc(r.id)}')">↩ إخفاء عن الموقع</button>`
          :`<button type="button" class="review-approve" onclick="window.approveReview('${esc(r.id)}')">✅ نشر هذا التقييم</button>`}
        <button type="button" class="review-delete" onclick="window.deleteReview('${esc(r.id)}')">🗑 حذف نهائي</button>
      </div>
    </div>`;
  }).join("")+'</div>';
  renderReviewsPagination(reviewsPage,totalPages);
}
function renderReviewsPagination(current,totalPages){
  const box=document.getElementById("reviewsPagination"); if(!box)return;
  if(!totalPages||totalPages<=1){box.innerHTML="";return;}
  let html=`<button class="page-btn" type="button" ${current<=1?"disabled":""} onclick="window.__reviewsGoPage(${Math.max(1,current-1)})">‹</button>`;
  const pages=[]; for(let i=1;i<=totalPages;i++){ if(i===1||i===totalPages||Math.abs(i-current)<=2) pages.push(i); else if(pages[pages.length-1]!=="…") pages.push("…"); }
  pages.forEach(n=>{if(n==="…") html+='<span class="page-info">…</span>'; else html+=`<button class="page-btn ${n===current?'active':''}" type="button" onclick="window.__reviewsGoPage(${n})">${n}</button>`;});
  html+=`<button class="page-btn" type="button" ${current>=totalPages?"disabled":""} onclick="window.__reviewsGoPage(${Math.min(totalPages,current+1)})">›</button>`;
  html+=`<span class="page-info">صفحة ${current} من ${totalPages}</span>`; box.innerHTML=html;
}
window.__reviewsGoPage=function(n){ reviewsPage=Math.max(1,Number(n)||1); renderReviews(); };
window.__reviewsSearchInput=function(v){ reviewsSearchQuery=v; reviewsPage=1; renderReviews(); };
window.toggleReviewsFilterMenu=function(){ document.getElementById("reviewsFilterMenu")?.classList.toggle("hidden"); };
window.setReviewStatusFilter=function(status){
  reviewsStatusFilter=status; reviewsPage=1;
  document.querySelectorAll("#reviewsFilterMenu button").forEach(b=>b.classList.toggle("active",b.dataset.status===status));
  document.getElementById("reviewsFilterMenu")?.classList.add("hidden");
  const btn=document.getElementById("reviewsFilterBtn"); if(btn) btn.classList.toggle("active",status!=="pending");
  renderReviews();
};
document.addEventListener("click",(e)=>{
  const menu=document.getElementById("reviewsFilterMenu");
  if(menu && !menu.classList.contains("hidden") && !e.target.closest(".orders-filter-wrap")) menu.classList.add("hidden");
});
window.approveReview=async function(id){
  try{
    await updateDoc(doc(db,"reviews",id),{approved:true,approvedAt:serverTimestamp()});
    reviewsAll=reviewsAll.map(r=>r.id===id?{...r,approved:true}:r);
    toast("تم نشر التقييم فصفحة المنتج ✅","ok");
    renderReviews();
  }catch(e){console.error(e);toast("تعذر نشر التقييم: "+(e.message||"خطأ غير معروف"),"err");}
};
window.unapproveReview=async function(id){
  try{
    await updateDoc(doc(db,"reviews",id),{approved:false});
    reviewsAll=reviewsAll.map(r=>r.id===id?{...r,approved:false}:r);
    toast("تم إخفاء التقييم عن صفحة المنتج","ok");
    renderReviews();
  }catch(e){console.error(e);toast("تعذر إخفاء التقييم: "+(e.message||"خطأ غير معروف"),"err");}
};
window.deleteReview=async function(id){
  if(!confirm("حذف هذا التقييم نهائيًا؟ لا يمكن التراجع.")) return;
  try{
    await deleteDoc(doc(db,"reviews",id));
    reviewsAll=reviewsAll.filter(r=>r.id!==id);
    toast("تم حذف التقييم ✅","ok");
    renderReviews();
  }catch(e){console.error(e);toast("تعذر حذف التقييم: "+(e.message||"خطأ غير معروف"),"err");}
};
function renderPagination(id,current,totalPages,stateName){
  const box=document.getElementById(id); if(!box)return;
  if(!totalPages || totalPages<=1){box.innerHTML="";return;}
  const type=stateName==="ordersPage"?"orders":"products";
  let html=`<button class="page-btn" type="button" ${current<=1?"disabled":""} onclick="window.__adminGoPage('${type}',${Math.max(1,current-1)})">‹</button>`;
  const pages=[]; for(let i=1;i<=totalPages;i++){ if(i===1||i===totalPages||Math.abs(i-current)<=2) pages.push(i); else if(pages[pages.length-1]!=="…") pages.push("…"); }
  pages.forEach(n=>{if(n==="…") html+='<span class="page-info">…</span>'; else html+=`<button class="page-btn ${n===current?'active':''}" type="button" onclick="window.__adminGoPage('${type}',${n})">${n}</button>`;});
  html+=`<button class="page-btn" type="button" ${current>=totalPages?"disabled":""} onclick="window.__adminGoPage('${type}',${Math.min(totalPages,current+1)})">›</button>`;
  html+=`<span class="page-info">صفحة ${current} من ${totalPages}</span>`; box.innerHTML=html;
}
function updateBulkUi(type){
  const isProducts=type==="products";
  const set=isProducts?selectedProducts:selectedOrders;
  const page=isProducts?productsPage:ordersPage;
  const filtered=isProducts?getFilteredProducts():getFilteredOrders();
  const start=(page-1)*ITEMS_PER_PAGE, pageRows=filtered.slice(start,start+ITEMS_PER_PAGE);
  const ids=pageRows.map(x=>x.id); const count=ids.filter(id=>set.has(id)).length;
  const all=ids.length>0&&count===ids.length;
  const cb=document.getElementById(isProducts?"selectAllProducts":"selectAllOrders"); if(cb)cb.checked=all;
  const countBox=document.getElementById(isProducts?"productsSelectedCount":"ordersSelectedCount"); if(countBox)countBox.textContent=`${set.size} محدد`;
  const btn=document.getElementById(isProducts?"bulkDeleteProducts":"bulkDeleteOrders"); if(btn)btn.disabled=set.size===0;
}
function getFilteredProducts(){
  const q=String(searchInput?.value||"").trim().toLowerCase();
  return products.filter(p=>{
    const hay=[p.name,p.category,p.description,p.id].map(v=>String(v||"").toLowerCase()).join(" ");
    if(q && !hay.includes(q))return false;
    if(lowStockFilter && Number(p.stock||0)>5)return false;
    return true;
  }).sort((a,b)=>(b.createdAt?.seconds||b._localCreatedAtSeconds||0)-(a.createdAt?.seconds||a._localCreatedAtSeconds||0));
}
window.toggleLowStockFilter=function(){
  lowStockFilter=!lowStockFilter;
  const btn=document.getElementById("lowStockFilterBtn");
  if(btn)btn.classList.toggle("active",lowStockFilter);
  productsPage=1; render();
};
window.toggleAllProducts=function(checked){
  const rows=getFilteredProducts(), start=(productsPage-1)*ITEMS_PER_PAGE, pageRows=rows.slice(start,start+ITEMS_PER_PAGE);
  pageRows.forEach(p=>checked?selectedProducts.add(p.id):selectedProducts.delete(p.id));
  updateBulkUi("products"); render();
};
window.toggleProductSelection=function(id,checked){
  if(checked)selectedProducts.add(id);else selectedProducts.delete(id);
  updateBulkUi("products");
};
window.toggleAllOrders=function(checked){
  const rows=getFilteredOrders(), start=(ordersPage-1)*ITEMS_PER_PAGE, pageRows=rows.slice(start,start+ITEMS_PER_PAGE);
  pageRows.forEach(o=>checked?selectedOrders.add(o.id):selectedOrders.delete(o.id));
  updateBulkUi("orders"); renderOrders();
};
window.toggleOrderSelection=function(id,checked){
  if(checked)selectedOrders.add(id);else selectedOrders.delete(id);
  updateBulkUi("orders");
};

window.bulkDeleteProducts=async()=>{
  const ids=[...selectedProducts]; if(!ids.length)return;
  if(!confirm(`هل تريد حذف ${ids.length} منتج${ids.length>1?'ات':''} نهائيًا؟`))return;
  const btn=document.getElementById("bulkDeleteProducts"); if(btn)btn.disabled=true;
  try{await Promise.all(ids.map(id=>deleteDoc(doc(db,"products",id)))); products=products.filter(p=>!selectedProducts.has(p.id)); selectedProducts.clear();
    const total=Math.max(1,Math.ceil(getFilteredProducts().length/ITEMS_PER_PAGE)); if(productsPage>total)productsPage=total; render();updateStats();show(`تم حذف ${ids.length} منتج بنجاح ✅`,"ok");
    window.bazarRefreshSeoAfterDelete();
  }catch(e){console.error(e);show("تعذر حذف بعض المنتجات: "+(e.message||"خطأ غير معروف"),"err");}
  finally{updateBulkUi("products");}
};
window.bulkDeleteOrders=async()=>{
  const ids=[...selectedOrders]; if(!ids.length)return;
  if(!confirm(`هل تريد حذف ${ids.length} طلبية نهائيًا؟`))return;
  const btn=document.getElementById("bulkDeleteOrders"); if(btn)btn.disabled=true;
  try{await Promise.all(ids.map(id=>deleteDoc(doc(db,"orders",id)))); window.adminOrders=(window.adminOrders||[]).filter(o=>!selectedOrders.has(o.id)); selectedOrders.clear();
    const total=Math.max(1,Math.ceil((window.adminOrders||[]).length/ITEMS_PER_PAGE)); if(ordersPage>total)ordersPage=total; updateOrderStats((window.adminOrders||[]).length); renderOrders();show(`تم حذف ${ids.length} طلبية بنجاح ✅`,"ok");
  }catch(e){console.error(e);show("تعذر حذف بعض الطلبيات: "+(e.message||"خطأ غير معروف"),"err");}
  finally{updateBulkUi("orders");}
};

window.bazarLoadAddons=function(){
  if(addonsLoaded)return;
  addonsLoaded=true;
  if(window.bazarSyncAddons)window.bazarSyncAddons();
  onSnapshot(doc(db,"settings","addons"),function(snap){
    if(snap&&snap.exists&&snap.exists()&&window.bazarOnRemoteAddon)window.bazarOnRemoteAddon(snap.data());
  },function(e){console.warn("addons realtime",e);});
};

window.deleteOrder=async id=>{if(!confirm("حذف هذه الطلبية؟"))return;try{await deleteDoc(doc(db,"orders",id));window.adminOrders=(window.adminOrders||[]).filter(o=>o.id!==id);selectedOrders.delete(id);const total=Math.max(1,Math.ceil((window.adminOrders||[]).length/ITEMS_PER_PAGE));if(ordersPage>total)ordersPage=total;updateOrderStats((window.adminOrders||[]).length);renderOrders();show("تم حذف الطلبية ✅","ok")}catch(e){alert("تعذر حذف الطلبية: "+e.message)}};

// ===== سجل الحظر المتقدم: مشترك بين أرقام الهاتف وعناوين IP =====
// كل وثيقة فـ collection "blockedPhones" (المعرّف = رقم الهاتف) أو "blockedIps" (المعرّف = ipKey) تحمل:
//   reason (سبب الحظر)، blockedBy (من حظر)، blockedAt (تاريخ الحظر)، expiresAt (غيابه = حظر دائم)،
//   status ("lifted" = مرفوع مع بقاء السجل)، liftedAt / liftedBy،
//   attempts (عدد محاولات الطلب بعد الحظر) + lastAttemptAt / lastAttemptIp / lastAttemptPhone (يكتبها الـ Worker وحده).
// السجلات القديمة التي لا تحمل هذه الحقول تبقى حظرًا دائمًا فعّالًا.
// ⚠️ منطق blockState() هنا يجب أن يبقى مطابقًا لـ isBlockActive() في worker/create-order.js.
function tsMs(v){
  if(!v)return 0;
  if(typeof v.toMillis==="function")return v.toMillis();
  if(v instanceof Date)return v.getTime();
  if(typeof v.seconds==="number")return v.seconds*1000;
  if(typeof v==="number")return v;
  return 0;
}
function fmtDT(ms){
  if(!ms)return"—";
  const d=new Date(ms);
  return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate())+" "+pad2(d.getHours())+":"+pad2(d.getMinutes());
}
function blockState(b){
  if(!b||b.status==="lifted")return"lifted";
  const e=tsMs(b.expiresAt);
  if(e&&e<=Date.now())return"expired";
  return"active";
}
function blockLeftTxt(e){
  const h=Math.ceil((e-Date.now())/36e5);
  if(h<=0)return"";
  return h<48?("باقي "+h+" ساعة"):("باقي "+Math.ceil(h/24)+" يومًا");
}
function sortBlocks(arr){
  const rank=b=>blockState(b)==="active"?0:1;
  return arr.slice().sort((a,b)=>rank(a)-rank(b)||tsMs(b.blockedAt)-tsMs(a.blockedAt));
}
function adminActor(){return(auth.currentUser&&auth.currentUser.email)||"admin";}
function cleanBlockBase(base){
  const o={};
  Object.keys(base||{}).forEach(k=>{const v=base[k];if(v!==""&&v!=null)o[k]=v;});
  return o;
}
// يكتب/يجدّد سجل الحظر (merge: يحتفظ بعدّاد المحاولات والتاريخ القديم) ثم يحدّث الحالة المحلية.
// keepDate=true عند تعديل حظر قائم (لا يتغيّر تاريخ الحظر ولا من حظر).
async function bkApply(kind,id,base,res,keepDate){
  const isIp=kind==="ip";
  const coll=isIp?"blockedIps":"blockedPhones";
  const kf=isIp?"key":"phone";
  base=cleanBlockBase(base);
  const data={...base,status:"active",reason:res.reason||"",expiresAt:res.expiresAt||deleteField(),liftedAt:deleteField(),liftedBy:deleteField(),updatedAt:serverTimestamp()};
  if(!keepDate){data.blockedAt=serverTimestamp();data.blockedBy=adminActor();}
  await setDoc(doc(db,coll,id),data,{merge:true});
  const list=isIp?blockedIps:blockedPhones;
  const old=list.find(x=>x[kf]===id)||{};
  const rec={...old,...base,[kf]:id,status:"active",reason:res.reason||""};
  delete rec.liftedAt;delete rec.liftedBy;
  if(res.expiresAt)rec.expiresAt=res.expiresAt;else delete rec.expiresAt;
  if(!keepDate){rec.blockedAt={seconds:Math.floor(Date.now()/1000)};rec.blockedBy=adminActor();}
  const next=sortBlocks([rec,...list.filter(x=>x[kf]!==id)]);
  if(isIp){blockedIps=next;blockedIpKeys=activeIpKeys();renderBlockedIps();}
  else{blockedPhones=next;renderBlockedPhones();}
}

// ----- نافذة الحظر: السبب + المدة (دائم أو مؤقت) -----
const BK_REASONS=["طلبات وهمية / احتيال","رفض استلام الطلبيات المتكرر","طلبات مزعجة أو مكررة","سلوك مشبوه (إنذار النظام)"];
const BK_DURATIONS=[["perm","دائم"],["24h","24 ساعة"],["3d","3 أيام"],["7d","7 أيام"],["30d","30 يومًا"]];
const BK_MS={"24h":864e5,"3d":3*864e5,"7d":7*864e5,"30d":30*864e5};
function bkParseReason(r){
  r=String(r||"").trim();
  for(const L of BK_REASONS){
    if(r===L)return{sel:L,txt:""};
    if(r.startsWith(L+" — "))return{sel:L,txt:r.slice(L.length+3)};
  }
  return{sel:r?"":BK_REASONS[0],txt:r};
}
function bkDialog(o){
  o=o||{};
  return new Promise(resolve=>{
    const m=document.getElementById("blockDialog");
    if(!m){resolve(null);return}
    if(window.__bkDone)window.__bkDone(null);
    const set=(id,html)=>{const el=document.getElementById(id);if(el)el.innerHTML=html;};
    document.getElementById("bkDlgTitle").textContent=o.title||"حظر";
    set("bkDlgTargets",(o.targets||[]).map(t=>`<div>${esc(t)}</div>`).join(""));
    const w=document.getElementById("bkDlgWarn");
    const warn=String(o.warn||"").trim();
    w.textContent=warn;w.classList.toggle("hidden",!warn);
    const pr=bkParseReason(o.reason);
    set("bkReasonSel",BK_REASONS.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join("")+'<option value="">سبب آخر (اكتبه أدناه)</option>');
    document.getElementById("bkReasonSel").value=pr.sel;
    document.getElementById("bkReasonTxt").value=pr.txt;
    set("bkDurSel",(o.edit?[["keep","إبقاء المدة الحالية ("+(o.curDur||"")+")"]]:[]).concat(BK_DURATIONS).map(d=>`<option value="${d[0]}">${esc(d[1])}</option>`).join(""));
    document.getElementById("bkDurSel").value=o.edit?"keep":"perm";
    document.getElementById("bkDlgOk").textContent=o.okText||"🚫 تأكيد الحظر";
    m.classList.remove("hidden");
    window.__bkDone=v=>{m.classList.add("hidden");window.__bkDone=null;resolve(v);};
  });
}
window.bkDialogSubmit=function(){
  const sel=document.getElementById("bkReasonSel").value;
  const txt=document.getElementById("bkReasonTxt").value.trim();
  const dur=document.getElementById("bkDurSel").value;
  if(!sel&&!txt){alert("اكتب سبب الحظر");return}
  const reason=sel?(sel+(txt?" — "+txt:"")):txt;
  const out={reason,expiresAt:BK_MS[dur]?new Date(Date.now()+BK_MS[dur]):null,keep:dur==="keep"};
  if(window.__bkDone)window.__bkDone(out);
};
window.bkDialogCancel=function(){if(window.__bkDone)window.__bkDone(null);};
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&window.__bkDone)window.bkDialogCancel();});

// ----- بطاقة سجل حظر (هاتف أو IP) -----
function bkCard(kind,b){
  const isIp=kind==="ip";
  const id=isIp?b.key:b.phone;
  const st=blockState(b);
  const exp=tsMs(b.expiresAt);
  const stTxt={active:"محظور",expired:"انتهت مدة الحظر",lifted:"مرفوع"}[st];
  const dur=exp?("مؤقت حتى "+fmtDT(exp)+(st==="active"?" · "+blockLeftTxt(exp):"")):"دائم";
  const who=[b.customerName,isIp?b.customerPhone:"",b.country].filter(Boolean).map(esc).join(" · ");
  const att=Number(b.attempts||0);
  const lastExtra=isIp?b.lastAttemptPhone:b.lastAttemptIp;
  const arg=`'${escJs(kind)}','${escJs(id)}'`;
  const btn=(cls,fn,txt)=>`<button class="bk-btn ${cls}" type="button" onclick="window.${fn}(${arg})">${txt}</button>`;
  const actions=st==="active"
    ?btn("ok","bkLift","✅ رفع الحظر")+btn("info","bkEdit","✏️ تعديل")
    :btn("warn","bkReblock","🚫 إعادة الحظر")+btn("danger","bkDelete","🗑 حذف السجل");
  const rows=[
    `<div>📝 السبب: ${b.reason?esc(b.reason):"<i>غير مسجّل</i>"}</div>`,
    b.blockedAt?`<div>📅 تاريخ الحظر: ${fmtDT(tsMs(b.blockedAt))}${b.blockedBy?` · 👤 ${esc(b.blockedBy)}`:""}</div>`:"",
    `<div>🔁 محاولات الطلب بعد الحظر: <b class="${att?"bk-att":""}">${att.toLocaleString("ar-DZ")}</b>${att&&b.lastAttemptAt?` (آخرها ${fmtDT(tsMs(b.lastAttemptAt))}${lastExtra?` · <span dir="ltr">${esc(lastExtra)}</span>`:""})`:""}</div>`,
    b.status==="lifted"?`<div>✅ رُفع الحظر: ${fmtDT(tsMs(b.liftedAt))}${b.liftedBy?` · 👤 ${esc(b.liftedBy)}`:""}</div>`:""
  ].join("");
  return `<div class="bk-card ${st==="active"?"":"bk-inactive"}"><div class="bk-main"><span class="bk-ico">${isIp?"🌐":"🚫"}</span><div class="bk-body"><div class="bk-title"><b dir="ltr">${esc(isIp?(b.ip||b.key):b.phone)}</b><span class="bk-state bk-st-${st}">${stTxt}</span><span class="bk-tag">${esc(dur)}</span></div>${who?`<div class="bk-meta">${who}</div>`:""}<div class="bk-details">${rows}</div></div></div><div class="bk-actions">${actions}</div></div>`;
}
function bkList(kind){return kind==="ip"?blockedIps:blockedPhones;}
function bkFind(kind,id){return bkList(kind).find(x=>x[kind==="ip"?"key":"phone"]===id);}
function bkLabel(kind,b,id){return kind==="ip"?((b&&b.ip)||id):id;}
function bkRerender(kind){
  if(kind==="ip"){blockedIps=sortBlocks(blockedIps);blockedIpKeys=activeIpKeys();renderBlockedIps();if(ordersLoaded)renderOrders();}
  else{blockedPhones=sortBlocks(blockedPhones);renderBlockedPhones();}
}
window.bkLift=async function(kind,id){
  const b=bkFind(kind,id);
  if(!confirm(`رفع الحظر عن ${kind==="ip"?"عنوان IP":"الرقم"} ${bkLabel(kind,b,id)}؟\nيبقى سجل الحظر (السبب والمحاولات) محفوظًا ويمكنك إعادة الحظر لاحقًا.`))return;
  try{
    await updateDoc(doc(db,kind==="ip"?"blockedIps":"blockedPhones",id),{status:"lifted",liftedAt:serverTimestamp(),liftedBy:adminActor()});
    if(b){b.status="lifted";b.liftedAt={seconds:Math.floor(Date.now()/1000)};b.liftedBy=adminActor();}
    bkRerender(kind);
    show("تم رفع الحظر ✅","ok");
  }catch(e){alert("تعذر رفع الحظر: "+(e.message||"خطأ غير معروف"))}
};
window.bkEdit=async function(kind,id){
  const b=bkFind(kind,id);
  if(!b)return;
  const e0=tsMs(b.expiresAt);
  const res=await bkDialog({title:"تعديل الحظر",targets:[bkLabel(kind,b,id)],reason:b.reason||"",edit:true,curDur:e0?("حتى "+fmtDT(e0)):"دائم",okText:"💾 حفظ التعديل"});
  if(!res)return;
  if(res.keep)res.expiresAt=e0?new Date(e0):null;
  try{await bkApply(kind,id,{},res,true);show("تم تحديث الحظر ✅","ok");}
  catch(e){alert("تعذر تحديث الحظر: "+(e.message||"خطأ غير معروف"))}
};
window.bkReblock=async function(kind,id){
  const b=bkFind(kind,id);
  if(!b)return;
  const res=await bkDialog({title:"إعادة الحظر",targets:[bkLabel(kind,b,id)],warn:kind==="ip"?ipRiskNote({key:id}):"",reason:b.reason||"",okText:"🚫 إعادة الحظر"});
  if(!res)return;
  try{await bkApply(kind,id,{},res,false);show("تمت إعادة الحظر ✅","ok");}
  catch(e){alert("تعذر إعادة الحظر: "+(e.message||"خطأ غير معروف"))}
};
window.bkDelete=async function(kind,id){
  const b=bkFind(kind,id);
  if(!confirm(`حذف سجل الحظر الخاص بـ ${bkLabel(kind,b,id)} نهائيًا؟\nسيُفقد سببه وتاريخه وعدّاد محاولاته.`))return;
  try{
    await deleteDoc(doc(db,kind==="ip"?"blockedIps":"blockedPhones",id));
    const kf=kind==="ip"?"key":"phone";
    if(kind==="ip")blockedIps=blockedIps.filter(x=>x[kf]!==id);else blockedPhones=blockedPhones.filter(x=>x[kf]!==id);
    bkRerender(kind);
    show("تم حذف السجل ✅","ok");
  }catch(e){alert("تعذر حذف السجل: "+(e.message||"خطأ غير معروف"))}
};

// ===== الأرقام المحظورة: منع رقم هاتف من تسجيل أي طلب جديد =====
// كل رقم محظور = وثيقة فـ collection "blockedPhones" معرّفها هو رقم الهاتف نفسه.
// الـ Worker (worker/create-order.js) يتحقق من هذا الـ collection قبل قبول أي طلب.
let blockedPhones=[];
let blockedPhonesLoaded=false;
function normalizePhone(p){return String(p||"").replace(/\s+/g,"").trim();}
window.bazarLoadBlockedPhones=async function(){
  const box=document.getElementById("blockedList");
  try{
    const snap=await getDocs(collection(db,"blockedPhones"));
    blockedPhones=sortBlocks(snap.docs.map(d=>({phone:d.id,...(d.data()||{})})));
    blockedPhonesLoaded=true;
    renderBlockedPhones();
  }catch(e){
    console.error("blockedPhones load",e);
    if(box)box.innerHTML='<div class="empty-card">❌ تعذر تحميل الأرقام المحظورة. تحقق من اتصال Firebase والصلاحيات.</div>';
  }
};
function renderBlockedPhones(){
  const box=document.getElementById("blockedList");
  if(!box)return;
  if(!blockedPhones.length){box.innerHTML='<div class="empty-card">لا توجد أرقام محظورة حاليًا.</div>';return}
  box.innerHTML=blockedPhones.map(b=>bkCard("phone",b)).join("");
}
function phoneBlockedNow(p){const r=blockedPhones.find(x=>x.phone===p);return !!r&&blockState(r)==="active";}
window.blockPhone=async function(phone,customerName){
  const p=normalizePhone(phone);
  if(!p){alert("رقم هاتف غير صالح");return false}
  if(!blockedPhonesLoaded)await window.bazarLoadBlockedPhones();
  if(phoneBlockedNow(p)){show("هذا الرقم محظور مسبقًا","ok");return false}
  const cur=blockedPhones.find(x=>x.phone===p);
  const res=await bkDialog({title:"حظر رقم هاتف",targets:[p],reason:cur?cur.reason:"",okText:"🚫 حظر الرقم"});
  if(!res)return false;
  try{
    await bkApply("phone",p,{phone:p,customerName:customerName||""},res,false);
    show("تم حظر الرقم ✅","ok");
    return true;
  }catch(e){alert("تعذر حظر الرقم: "+(e.message||"خطأ غير معروف"));return false}
};
// حظر رقم هاتف الزبون + عنوان IP متاع نفس الطلب بضغطة واحدة (زر 🚫 في صفحة الطلبات).
window.blockOrderPhoneAndIp=async function(orderId){
  const o=(window.adminOrders||[]).find(x=>x.id===orderId)||{};
  const p=normalizePhone(o.customerPhone||o.phone||"");
  const n=o.ip?normalizeIp(o.ip):null;
  if(!p&&!n){alert("لا يوجد رقم هاتف أو عنوان IP صالح لهذا الطلب");return}
  if(p&&!blockedPhonesLoaded)await window.bazarLoadBlockedPhones();
  if(n&&!blockedIpsLoaded){try{await window.bazarLoadBlockedIps()}catch(e){}}
  const doPhone=!!p&&!phoneBlockedNow(p);
  const doIp=!!n&&!blockedIpKeys.has(n.key);
  if(!doPhone&&!doIp){show("محظور مسبقًا ✅","ok");return}
  const targets=[doPhone?`📞 ${p}`:"",doIp?`🌐 ${n.display}`:""].filter(Boolean);
  const cur=doPhone?blockedPhones.find(x=>x.phone===p):null;
  const res=await bkDialog({title:"حظر الزبون",targets,warn:doIp?ipRiskNote(n):"",reason:cur?cur.reason:"",okText:"🚫 تأكيد الحظر"});
  if(!res)return;
  try{
    const name=o.customerName||o.name||"";
    if(doPhone)await bkApply("phone",p,{phone:p,customerName:name},res,false);
    if(doIp)await saveBlockedIp(n,{customerName:name,customerPhone:p,country:o.country||""},res);
    show("تم الحظر ✅","ok");
  }catch(e){alert("تعذر الحظر: "+(e.message||"خطأ غير معروف"))}
};
window.unblockPhone=function(phone){return window.bkLift("phone",phone);};
window.blockPhoneManual=function(){
  const input=document.getElementById("blockPhoneInput");
  const p=normalizePhone(input?.value);
  if(!/^0[5-7][0-9]{8}$/.test(p)){alert("أدخل رقم هاتف جزائري صحيح (مثال: 0551234567)");return}
  window.blockPhone(p,"").then(ok=>{if(ok&&input)input.value=""});
};

// ===== عناوين IP المحظورة: منع عنوان IP من تسجيل أي طلب جديد =====
// كل IP محظور = وثيقة فـ collection "blockedIps" معرّفها هو مفتاح الـ IP (ipKey).
// عنوان IP لا يعرفه إلا الـ Worker (worker/create-order.js) الذي يحفظه مع كل طلب
// (الحقل ip) ويرفض أي طلب قادم من IP محظور.
// ⚠️ دوال التطبيع التالية منسوخة حرفيًا من normalizeIp() في worker/create-order.js:
// يجب أن تبقى متطابقة، وإلا لن يتطابق مفتاح الحظر هنا مع ما يفحصه الـ Worker.
function parseIpv6(ip) {
  ip = ip.split("%")[0];
  const m = ip.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (m) {
    const p = m[2].split(".").map(Number);
    if (p.some((n) => n > 255)) return null;
    ip = m[1] + ((p[0] << 8) | p[1]).toString(16) + ":" + ((p[2] << 8) | p[3]).toString(16);
  }
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  let groups;
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    groups = [...head, ...Array(missing).fill("0"), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  const out = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out;
}

function normalizeIp(raw) {
  if (!raw || typeof raw !== "string") return null;
  const ip = raw.trim().toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts.some((n) => n > 255)) return null;
    const v4 = parts.join(".");
    return { raw: v4, key: v4, display: v4 };
  }
  if (ip.includes(":")) {
    const g = parseIpv6(ip);
    if (!g) return null;
    // ::ffff:a.b.c.d (IPv4 داخل IPv6) → نعامله كـ IPv4 عادي
    if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
      const v4 = [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255].join(".");
      return { raw: v4, key: v4, display: v4 };
    }
    const prefix = g.slice(0, 4).map((x) => x.toString(16));
    return { raw: ip, key: "v6-" + prefix.join("-"), display: prefix.join(":") + "::/64" };
  }
  return null;
}

let blockedIps=[];
let blockedIpKeys=new Set();
let blockedIpsLoaded=false;
let blockedIpsTried=false;
function orderIpCounts(orders){
  const c={};
  (orders||[]).forEach(o=>{const n=o.ip?normalizeIp(o.ip):null; if(n)c[n.key]=(c[n.key]||0)+1;});
  return c;
}
window.bazarLoadBlockedIps=async function(){
  const box=document.getElementById("blockedIpList");
  try{
    const snap=await getDocs(collection(db,"blockedIps"));
    blockedIps=sortBlocks(snap.docs.map(d=>({key:d.id,...(d.data()||{})})));
    blockedIpKeys=activeIpKeys();
    blockedIpsLoaded=true;
    renderBlockedIps();
  }catch(e){
    console.error("blockedIps load",e);
    if(box)box.innerHTML='<div class="empty-card">❌ تعذر تحميل عناوين IP المحظورة. تحقق من نشر Firestore Rules (يجب أن تحتوي على blockedIps).</div>';
    throw e;
  }
};
function activeIpKeys(){return new Set(blockedIps.filter(b=>blockState(b)==="active").map(b=>b.key));}
function renderBlockedIps(){
  const box=document.getElementById("blockedIpList");
  if(!box)return;
  blockedIpKeys=activeIpKeys();
  if(!blockedIps.length){box.innerHTML='<div class="empty-card">لا توجد عناوين IP محظورة حاليًا.</div>';return}
  box.innerHTML=blockedIps.map(b=>bkCard("ip",b)).join("");
}
async function saveBlockedIp(n,meta,res){
  meta=meta||{};
  res=res||{reason:"",expiresAt:null};
  await bkApply("ip",n.key,{ip:n.display,ipKey:n.key,customerName:meta.customerName||"",customerPhone:meta.customerPhone||"",country:meta.country||""},res,false);
}
function ipRiskNote(n){
  return n.key.startsWith("v6-")
    ? "\n(عنوان IPv6: سيُحظر كل نطاق الشبكة /64 الذي ينتمي إليه.)"
    : "\n⚠️ قد يشترك زبائن آخرون في نفس العنوان (خاصة عبر شبكات الهاتف).";
}
// حظر IP الطلب: يحظر عنوانه ثم يعرض حذف كل الطلبات القادمة من نفس العنوان
window.blockOrderIp=async function(orderId){
  const o=(window.adminOrders||[]).find(x=>x.id===orderId);
  const n=o&&o.ip?normalizeIp(o.ip):null;
  if(!n){alert("لا يوجد عنوان IP محفوظ لهذا الطلب (الطلبات القديمة لا تحمله).");return}
  const related=(window.adminOrders||[]).filter(x=>{const m=x.ip?normalizeIp(x.ip):null;return m&&m.key===n.key;});
  const already=blockedIpKeys.has(n.key);
  if(!already){
    if(!blockedIpsLoaded){try{await window.bazarLoadBlockedIps()}catch(e){}}
    const cur=blockedIps.find(x=>x.key===n.key);
    const res=await bkDialog({title:"حظر عنوان IP",targets:[n.display],warn:ipRiskNote(n),reason:cur?cur.reason:"",okText:"🚫 حظر الـ IP"});
    if(!res)return;
    try{
      await saveBlockedIp(n,{customerName:o.customerName||o.name||"",customerPhone:o.customerPhone||o.phone||"",country:o.country||""},res);
      show("تم حظر عنوان IP ✅","ok");
    }catch(e){alert("تعذر حظر عنوان IP: "+(e.message||"خطأ غير معروف"));return}
  }else if(related.length<1){
    show("هذا العنوان محظور مسبقًا","ok");return;
  }
  if(related.length>0&&confirm(`يوجد ${related.length} طلب${related.length>1?"ات":""} من عنوان IP ‏${n.display}.\nهل تريد حذفها نهائيًا (إن كانت طلبات وهمية)؟`)){
    try{
      await Promise.all(related.map(x=>deleteDoc(doc(db,"orders",x.id))));
      const gone=new Set(related.map(x=>x.id));
      window.adminOrders=(window.adminOrders||[]).filter(x=>!gone.has(x.id));
      gone.forEach(id=>selectedOrders.delete(id));
      const total=Math.max(1,Math.ceil((window.adminOrders||[]).length/ITEMS_PER_PAGE));if(ordersPage>total)ordersPage=total;
      updateOrderStats((window.adminOrders||[]).length);
      show(`تم حذف ${related.length} طلب ✅`,"ok");
      if(gone.has(window.__detailOrderId)){window.backToOrders();return}
    }catch(e){console.error(e);show("تعذر حذف بعض الطلبات: "+(e.message||"خطأ غير معروف"),"err")}
  }
  renderOrders();
  if(window.__detailOrderId&&(window.adminOrders||[]).some(x=>x.id===window.__detailOrderId)){
    const cur=window.adminOrders.find(x=>x.id===window.__detailOrderId);
    const dv=document.getElementById("view-order-detail");
    if(cur&&dv&&!dv.classList.contains("hidden"))renderOrderDetail(cur);
  }
};
window.unblockIp=function(key){return window.bkLift("ip",key);};
// ===== حالة الـ Worker =====
// لا يوجد أي مسار احتياطي: firestore.rules تمنع أي إنشاء مباشر للطلبات دائمًا (orders:
// allow create فقط للأدمن)، فالـ Worker هو الطريق الوحيد لتسجيل طلب زبون. هذا الفحص
// تشخيصي فقط ليتأكد الأدمن أن النسخة المنشورة سليمة ومُعدّة بكل الأسرار اللازمة.
const BAZAR_WORKER_BASE="https://noisy-lake-ace8.a-bazar-dzair-pro.workers.dev";
let workerReady=false;
window.bazarCheckWorker=async function(){
  const box=document.getElementById("workerHealthBox");
  if(box)box.innerHTML="⏳ جاري فحص الـ Worker...";
  workerReady=false;
  try{
    const r=await fetch(BAZAR_WORKER_BASE+"/health",{cache:"no-store"});
    const j=await r.json();
    if(!j||!j.version)throw new Error("not-new-worker");
    workerReady=j.ready===true;
    const yn=v=>v?"✅":"❌";
    const cfg=j.configured||{};
    const lines=[
      `${yn(true)} الـ Worker الجديد منشور (${esc(j.version)})`,
      `${yn(cfg.FIREBASE_PROJECT_ID)} FIREBASE_PROJECT_ID`,
      `${yn(cfg.FIREBASE_CLIENT_EMAIL)} FIREBASE_CLIENT_EMAIL`,
      `${yn(cfg.FIREBASE_PRIVATE_KEY)} FIREBASE_PRIVATE_KEY`,
      `${yn(j.auth==="ok")} اتصال Google: ${esc(j.auth)}`,
      `${yn(j.firestore==="ok")} صلاحية Firestore: ${esc(j.firestore)}`,
      `${j.telegram?"✅":"⚪"} إشعارات Telegram ${j.telegram?"مفعّلة":"غير مُعدّة (اختياري)"}`,
      `${j.seoTrigger?"✅":"❌"} تحديث صفحات المتجر بعد الحذف (GITHUB_TOKEN) ${j.seoTrigger?"مُعدّ":"غير مُعدّ — ستبقى منتجات محذوفة ظاهرة في الصفحة الرئيسية حتى 6 ساعات"}`
    ];
    if(box)box.innerHTML=`<div style="text-align:right;line-height:2">${lines.join("<br>")}<br><b>${workerReady?"🎉 الـ Worker جاهز — حظر IP وكشف الإساءة يعملان.":"⚠️ الـ Worker غير جاهز بعد: أصلح العناصر ❌ أعلاه. الطلبات ستفشل (لا يوجد مسار احتياطي) حتى تُصلَح."}</b></div>`;
  }catch(e){
    console.error("worker health",e);
    if(box)box.innerHTML='<div style="text-align:right;line-height:2">❌ تعذر الوصول إلى نسخة الـ Worker الجديدة (غير منشورة، أو ما زالت النسخة القديمة، أو الرابط خاطئ).<br><b>الطلبات ستفشل حتى يُنشر create-order.js بشكل سليم — لا يوجد مسار احتياطي.</b></div>';
  }
};
// ===== تشغيل تحديث صفحات SEO بعد تغيير البانر =====
// POST /trigger-seo على الـ Worker: يتحقق من توكن الأدمن ثم يشغّل GitHub Action. لا يرمي خطأ أبدًا،
// بل يرجع {ok, message} حتى لا يُفسد مسار حفظ الإعدادات. توكن GitHub يبقى داخل الـ Worker فقط.
window.bazarTriggerSeo=async function(){
  const user=window.bazarAuth&&window.bazarAuth.currentUser;
  if(!user)return{ok:false,message:"جلسة الدخول انتهت، سجّل الدخول من جديد"};
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),15000);
  try{
    let idToken;
    try{idToken=await user.getIdToken(true);}
    catch(e){console.error("trigger-seo token",e);return{ok:false,message:"تعذر تجديد جلسة الدخول، سجّل الدخول من جديد"};}
    const r=await fetch(BAZAR_WORKER_BASE+"/trigger-seo",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({idToken}),
      signal:ctrl.signal
    });
    let j=null;
    try{j=await r.json();}catch(e){}
    if(r.ok&&j&&j.ok===true)return{ok:true,message:""};
    const byStatus={
      401:"انتهت صلاحية الجلسة، سجّل الدخول من جديد",
      403:"هذا الحساب غير مصرّح له بالتشغيل",
      404:"نسخة الـ Worker المنشورة قديمة وليس فيها /trigger-seo",
      503:"سرّ GITHUB_TOKEN غير مضبوط في الـ Worker",
      502:"تعذر الاتصال بـ GitHub، تحقق من صلاحية التوكن"
    };
    return{ok:false,message:byStatus[r.status]||("رد غير متوقع من الـ Worker: "+r.status)};
  }catch(e){
    console.error("trigger-seo",e);
    return{ok:false,message:e&&e.name==="AbortError"?"انتهت مهلة الاتصال بالـ Worker":"تعذر الوصول إلى الـ Worker"};
  }finally{
    clearTimeout(timer);
  }
};
// بعد حذف منتجات: نُعيد توليد الصفحات الثابتة (الرئيسية + /product/ + خرائط الموقع) عبر نفس الـ Worker،
// حتى لا تبقى نسخة قديمة فيها منتجات محذوفة حتى الـ cron القادم (6 ساعات). تأخير قصير يجمع حذفات متتالية
// في تشغيل واحد. لا يرمي خطأ ولا يعطّل الحذف؛ عند الفشل يظهر تنبيه فقط.
window.bazarRefreshSeoAfterDelete=function(){
  clearTimeout(window.__bazarSeoDeleteTimer);
  window.__bazarSeoDeleteTimer=setTimeout(async function(){
    let r;
    try{r=await window.bazarTriggerSeo();}catch(e){r={ok:false,message:"خطأ غير متوقع"};}
    if(!r||!r.ok)show("تم الحذف ✅ لكن تعذر تحديث صفحات المتجر الثابتة فورًا ("+((r&&r.message)||"سبب غير معروف")+"). ستُحدَّث تلقائيًا خلال 6 ساعات كحد أقصى.","err");
  },4000);
};
window.blockIpManual=async function(){
  const input=document.getElementById("blockIpInput");
  const n=normalizeIp(input?.value);
  if(!n){alert("أدخل عنوان IP صحيحًا (IPv4 مثل 41.111.22.33 أو IPv6)");return}
  if(!blockedIpsLoaded){try{await window.bazarLoadBlockedIps()}catch(e){}}
  if(blockedIpKeys.has(n.key)){show("هذا العنوان محظور مسبقًا","ok");return}
  const cur=blockedIps.find(x=>x.key===n.key);
  const res=await bkDialog({title:"حظر عنوان IP",targets:[n.display],warn:ipRiskNote(n),reason:cur?cur.reason:"",okText:"🚫 حظر الـ IP"});
  if(!res)return;
  try{
    await saveBlockedIp(n,{},res);
    if(input)input.value="";
    show("تم حظر عنوان IP ✅","ok");
    if(ordersLoaded)renderOrders();
  }catch(e){alert("تعذر حظر عنوان IP: "+(e.message||"خطأ غير معروف"))}
};

// ===== إنذارات الإساءة (Fraud / Abuse) =====
// يكتب الـ Worker الإنذارات في collection "fraudAlerts" (الكتابة له وحده)، والأدمن يقرأها ويغيّر حالتها.
// ⚠️ نصوص الأسباب هنا منسوخة من FLAG_INFO في worker/create-order.js — أي تعديل هناك يُعدَّل هنا أيضًا.
const FRAUD_FLAG_AR={
  ip_burst:"عدد كبير من الطلبات من نفس الـ IP في وقت قصير",
  ip_many_phones:"نفس الـ IP استعمل عدة أرقام هاتف مختلفة",
  phone_repeat:"نفس رقم الهاتف أرسل عدة طلبات متتالية",
  device_many_phones:"نفس الجهاز جرّب أرقام هاتف مختلفة",
  device_burst:"نفس الجهاز أرسل عدد كبير من الطلبات في وقت قصير",
  address_repeat:"عدد كبير من الطلبات لنفس العنوان",
  device_evading_block:"جهاز سبق أن حاول الطلب برقم/IP محظور عاد الآن بمعطيات مختلفة",
  blocked_attempt:"محاولة طلب من رقم أو IP محظور"
};
const FRAUD_SEV={high:"خطر عالٍ",medium:"خطر متوسط",low:"خطر منخفض"};
const FRAUD_KEY_AR={ip:"IP",phone:"الهاتف",device:"الجهاز",addr:"العنوان"};
let fraudAlerts=[];
let fraudLoaded=false;
let fraudStatusFilter="open";
let fraudSevFilter="all";
function alertIpNorm(ip){return normalizeIp(String(ip||"").replace(/\/\d+$/,""));}
function updateFraudBadge(){
  const el=document.getElementById("fraudNavBadge");
  if(!el)return;
  const n=fraudAlerts.filter(a=>!a.resolved&&!a.seen).length;
  el.textContent=n>99?"99+":String(n);
  el.classList.toggle("hidden",n===0);
}
async function ensureBlocksLoaded(){
  const jobs=[];
  if(!blockedPhonesLoaded)jobs.push(window.bazarLoadBlockedPhones());
  if(!blockedIpsLoaded)jobs.push(window.bazarLoadBlockedIps());
  await Promise.allSettled(jobs);
}
window.bazarLoadFraudAlerts=async function(quiet){
  const box=document.getElementById("fraudList");
  if(!quiet&&box&&!fraudLoaded)box.innerHTML='<div class="empty-card">⏳ جاري تحميل الإنذارات...</div>';
  try{
    const snap=await getDocs(query(collection(db,"fraudAlerts"),orderBy("createdAt","desc"),limit(300)));
    fraudAlerts=snap.docs.map(d=>({id:d.id,...(d.data()||{})}));
    fraudLoaded=true;
    updateFraudBadge();
    if(!quiet)await ensureBlocksLoaded();
    renderFraudAlerts();
  }catch(e){
    console.error("fraudAlerts load",e);
    if(!quiet&&box)box.innerHTML='<div class="empty-card">❌ تعذر تحميل الإنذارات. تحقق من نشر Firestore Rules (يجب أن تحتوي على fraudAlerts).</div>';
  }
};
window.fraudSetFilter=function(kind,v){
  if(kind==="status")fraudStatusFilter=v;else fraudSevFilter=v;
  renderFraudAlerts();
};
function fraudRow(a){
  const sev=FRAUD_SEV[a.severity]?a.severity:"low";
  const cls=a.resolved?"fr-resolved":(a.seen?"":"fr-new");
  const phone=a.phone?normalizePhone(a.phone):"";
  const ipN=alertIpNorm(a.ip);
  const phoneBlocked=!!phone&&phoneBlockedNow(phone);
  const ipBlocked=!!ipN&&blockedIpKeys.has(ipN.key);
  const id=escJs(a.id);
  const btn=(c,fn,arg,txt)=>`<button class="bk-btn ${c}" type="button" onclick="window.${fn}(${arg})">${txt}</button>`;
  const chips=[
    a.keyType&&FRAUD_KEY_AR[a.keyType]?`<span class="fr-chip">🔑 ${FRAUD_KEY_AR[a.keyType]}</span>`:"",
    Number(a.count)>1?`<span class="fr-chip">×${Number(a.count).toLocaleString("ar-DZ")}</span>`:"",
    a.blockedAttempt?'<span class="fr-chip fr-chip-red">🚫 محاولة بعد الحظر</span>':"",
    phone?`<span class="fr-chip">📞 <span dir="ltr">${esc(phone)}</span></span>`:"",
    a.ip?`<span class="fr-chip">🌐 <span dir="ltr">${esc(a.ip)}</span>${a.country?` · ${esc(a.country)}`:""}</span>`:""
  ].join("");
  const actions=[
    a.orderId?btn("info","fraudOpenOrder",`'${id}'`,"👁 عرض الطلب"):"",
    phone?(phoneBlocked?'<span class="fr-done">📞 الرقم محظور ✅</span>':btn("warn","fraudBlock",`'phone','${id}'`,"🚫 حظر الرقم")):"",
    ipN?(ipBlocked?'<span class="fr-done">🌐 الـ IP محظور ✅</span>':btn("warn","fraudBlock",`'ip','${id}'`,"🌐 حظر الـ IP")):"",
    !a.seen&&!a.resolved?btn("info","fraudAct",`'seen','${id}'`,"👁 مقروء"):"",
    a.resolved?btn("info","fraudAct",`'reopen','${id}'`,"↩ إعادة فتح"):btn("ok","fraudAct",`'resolve','${id}'`,"✔ تمت المعالجة"),
    btn("danger","fraudAct",`'delete','${id}'`,"🗑")
  ].join("");
  return `<div class="fr-item fr-sev-${sev} ${cls}"><div class="fr-head"><span class="risk-badge risk-${sev}">⚠ ${FRAUD_SEV[sev]}</span><b class="fr-msg">${esc(a.message||FRAUD_FLAG_AR[a.type]||a.type||"إنذار")}</b><span class="fr-time">${fmtDT(tsMs(a.createdAt))}</span></div><div class="fr-chips">${chips}</div><div class="bk-actions">${actions}</div></div>`;
}
function renderFraudAlerts(){
  const box=document.getElementById("fraudList");
  if(!box)return;
  const open=fraudAlerts.filter(a=>!a.resolved);
  const st=document.getElementById("fraudStats");
  if(st){
    const cell=(n,l,c)=>`<div class="fr-stat ${c||""}"><b>${Number(n).toLocaleString("ar-DZ")}</b><span>${l}</span></div>`;
    st.innerHTML=cell(open.length,"إنذارات مفتوحة")+cell(open.filter(a=>a.severity==="high").length,"خطر عالٍ","fr-high")+cell(open.filter(a=>a.blockedAttempt).length,"محاولات بعد الحظر","fr-med")+cell(open.filter(a=>!a.seen).length,"غير مقروءة","fr-new");
  }
  const rows=fraudAlerts.filter(a=>{
    if(fraudStatusFilter==="open"&&a.resolved)return false;
    if(fraudStatusFilter==="new"&&(a.resolved||a.seen))return false;
    if(fraudStatusFilter==="resolved"&&!a.resolved)return false;
    if(fraudSevFilter!=="all"&&a.severity!==fraudSevFilter)return false;
    return true;
  });
  box.innerHTML=rows.length?rows.map(fraudRow).join(""):'<div class="empty-card">✅ لا توجد إنذارات مطابقة.</div>';
}
window.fraudAct=async function(action,id){
  const a=fraudAlerts.find(x=>x.id===id);
  if(!a)return;
  const ref=doc(db,"fraudAlerts",id);
  try{
    if(action==="seen"){await updateDoc(ref,{seen:true});a.seen=true;}
    else if(action==="resolve"){await updateDoc(ref,{resolved:true,seen:true,resolvedAt:serverTimestamp(),resolvedBy:adminActor()});a.resolved=true;a.seen=true;}
    else if(action==="reopen"){await updateDoc(ref,{resolved:false,resolvedAt:deleteField(),resolvedBy:deleteField()});a.resolved=false;}
    else if(action==="delete"){
      if(!confirm("حذف هذا الإنذار؟"))return;
      await deleteDoc(ref);
      fraudAlerts=fraudAlerts.filter(x=>x.id!==id);
    }
    updateFraudBadge();
    renderFraudAlerts();
  }catch(e){alert("تعذر تنفيذ العملية: "+(e.message||"خطأ غير معروف"))}
};
window.fraudMarkAllSeen=async function(){
  const ids=fraudAlerts.filter(a=>!a.seen&&!a.resolved).map(a=>a.id);
  if(!ids.length){show("لا توجد إنذارات غير مقروءة","ok");return}
  try{
    const b=writeBatch(db);
    ids.forEach(id=>b.update(doc(db,"fraudAlerts",id),{seen:true}));
    await b.commit();
    fraudAlerts.forEach(a=>{if(ids.includes(a.id))a.seen=true;});
    updateFraudBadge();renderFraudAlerts();
    show("تم تعليم "+ids.length+" إنذار كمقروء ✅","ok");
  }catch(e){alert("تعذر التحديث: "+(e.message||"خطأ غير معروف"))}
};
window.fraudDeleteResolved=async function(){
  const ids=fraudAlerts.filter(a=>a.resolved).map(a=>a.id);
  if(!ids.length){show("لا توجد إنذارات معالجة للحذف","ok");return}
  if(!confirm("حذف "+ids.length+" إنذار معالج نهائيًا؟"))return;
  try{
    const b=writeBatch(db);
    ids.forEach(id=>b.delete(doc(db,"fraudAlerts",id)));
    await b.commit();
    fraudAlerts=fraudAlerts.filter(a=>!a.resolved);
    updateFraudBadge();renderFraudAlerts();
    show("تم حذف "+ids.length+" إنذار ✅","ok");
  }catch(e){alert("تعذر الحذف: "+(e.message||"خطأ غير معروف"))}
};
window.fraudOpenOrder=async function(orderId){
  try{if(!ordersLoaded)await window.bazarLoadOrders();}catch(e){}
  if(!(window.adminOrders||[]).some(x=>x.id===orderId)){show("لم يُعثر على الطلب (ربما حُذف)","err");return}
  window.openOrderDetail(orderId);
};
window.fraudBlock=async function(kind,alertId){
  const a=fraudAlerts.find(x=>x.id===alertId);
  if(!a)return;
  await ensureBlocksLoaded();
  const reason="سلوك مشبوه (إنذار النظام)"+(a.message?" — "+a.message:"");
  try{
    if(kind==="phone"){
      const p=normalizePhone(a.phone);
      if(!p)return;
      if(phoneBlockedNow(p)){show("هذا الرقم محظور مسبقًا","ok");renderFraudAlerts();return}
      const res=await bkDialog({title:"حظر رقم هاتف",targets:[p],reason,okText:"🚫 حظر الرقم"});
      if(!res)return;
      await bkApply("phone",p,{phone:p},res,false);
    }else{
      const n=alertIpNorm(a.ip);
      if(!n)return;
      if(blockedIpKeys.has(n.key)){show("هذا العنوان محظور مسبقًا","ok");renderFraudAlerts();return}
      const res=await bkDialog({title:"حظر عنوان IP",targets:[n.display],warn:ipRiskNote(n),reason,okText:"🚫 حظر الـ IP"});
      if(!res)return;
      await saveBlockedIp(n,{customerPhone:a.phone||"",country:a.country||""},res);
    }
    show("تم الحظر ✅","ok");
    renderFraudAlerts();
  }catch(e){alert("تعذر الحظر: "+(e.message||"خطأ غير معروف"))}
};

// ===== علامة الخطر على الطلبات (الحقول riskLevel / riskFlags يضيفها الـ Worker عند وجود إشارة) =====
function riskBadgeHtml(o){
  const lv=o&&o.riskLevel;
  if(!FRAUD_SEV[lv])return"";
  const flags=Array.isArray(o.riskFlags)?o.riskFlags.map(c=>FRAUD_FLAG_AR[c]||c).join(" — "):"";
  return`<span class="risk-badge risk-${lv}" title="${esc(flags)}">⚠ ${FRAUD_SEV[lv]}</span>`;
}
function orderFieldCount(field,value){
  if(!value)return 0;
  return(window.adminOrders||[]).filter(x=>x&&x[field]===value).length;
}
function riskDetailRows(o){
  const rows=[];
  if(FRAUD_SEV[o.riskLevel]){
    rows.push(`<div class="order-detail-row"><span>درجة الخطر</span><span>${riskBadgeHtml(o)}</span></div>`);
    if(Array.isArray(o.riskFlags)&&o.riskFlags.length){
      rows.push(`<div class="order-detail-row"><span>أسباب الإنذار</span><span style="font-weight:600;line-height:1.8;text-align:right">${o.riskFlags.map(c=>esc(FRAUD_FLAG_AR[c]||c)).join("<br>")}</span></div>`);
    }
  }
  const ph=normalizePhone(o.customerPhone||o.phone||"");
  const cP=ph?(window.adminOrders||[]).filter(x=>normalizePhone(x.customerPhone||x.phone||"")===ph).length:0;
  const cD=orderFieldCount("deviceId",o.deviceId);
  const cA=orderFieldCount("addrKey",o.addrKey);
  if(cP>1)rows.push(`<div class="order-detail-row"><span>طلبات من نفس الهاتف</span><span style="color:#c62828">${cP}</span></div>`);
  if(cD>1)rows.push(`<div class="order-detail-row"><span>طلبات من نفس الجهاز</span><span style="color:#c62828">${cD}</span></div>`);
  if(cA>1)rows.push(`<div class="order-detail-row"><span>طلبات لنفس العنوان</span><span style="color:#c62828">${cA}</span></div>`);
  return rows.join("");
}

// ===== روابط المنتجات والتصنيفات بالفرنسية (أحرف لاتينية a-z0-9 و"-" فقط) =====
// المنتج: name_fr، وإن كان فارغًا واسم المنتج بلا حروف عربية نستعمل name، وإلا "produit-<6 أحرف من المعرّف>".
// نفس المنطق حرفيًا في index.html / product.html / admin.html / scripts/generate_static_products.py
// حتى يتطابق الرابط المبني في المتصفح مع مجلد الصفحة الثابتة المولَّدة.
function frSlug(x){
  return String(x==null?"":x).toLowerCase()
    .replace(/\u0153/g,"oe").replace(/\u00e6/g,"ae").replace(/\u00df/g,"ss")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
}
function productSlugOf(p){
  p=p||{};
  const nm=String(p.name||p.product||"");
  let s=frSlug(p.name_fr);
  if(!s&&!/[\u0600-\u06ff]/.test(nm)) s=frSlug(nm);
  if(!s) s=("produit-"+frSlug(p.firestoreId||p.id||"").slice(0,6)).replace(/-+$/,"");
  return s;
}
// productSlug: الصيغة القديمة (من الاسم العربي) — لم تعد تُستعمل في الروابط الجديدة.
function productSlug(name){
  return String(name||"product").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu,"-").replace(/^-+|-+$/g,"")||"product";
}
function getProductStoreUrl(p){
  const slug=productSlugOf(p);
  return new URL("product/"+encodeURIComponent(slug)+"/",window.location.origin+window.location.pathname.replace(/[^/]*$/,"")).href;
}
window.openProductStore=function(id){
  const p=products.find(x=>x.id===id);
  if(!p)return;
  const url=getProductStoreUrl(p);
  window.open(url,"_blank","noopener");
};
window.copyProductLink=async function(id){
  const p=products.find(x=>x.id===id);
  if(!p)return;
  const url=getProductStoreUrl(p);
  try{
    await navigator.clipboard.writeText(url);
    show("تم نسخ رابط المنتج ✅","ok");
  }catch(e){
    const ta=document.createElement("textarea");ta.value=url;document.body.appendChild(ta);ta.select();document.execCommand("copy");ta.remove();
    show("تم نسخ رابط المنتج ✅","ok");
  }
};

window.render=()=>{
  if(!listBox||!searchInput)return;
  const filtered=getFilteredProducts();
  const totalPages=Math.max(1,Math.ceil(filtered.length/ITEMS_PER_PAGE));
  if(productsPage>totalPages)productsPage=totalPages;
  if(!filtered.length){
    listBox.innerHTML=`<div class="empty-card"><span class="empty-icon">📦</span><b>لا توجد منتجات</b><span>${searchInput.value.trim()?"لم نجد منتجًا مطابقًا لبحثك.":"أضف أول منتج ليظهر هنا."}</span><button class="orange-btn" type="button" onclick="showView('product',null,true)">＋ إضافة منتج</button></div>`;
    renderPagination("productsPagination",1,0,"productsPage");updateBulkUi("products");return;
  }
  const start=(productsPage-1)*ITEMS_PER_PAGE, pageRows=filtered.slice(start,start+ITEMS_PER_PAGE);
  const totalBadge=document.getElementById("productsTotalCount"); if(totalBadge)totalBadge.textContent=Number(filtered.length).toLocaleString("ar-DZ");
  listBox.innerHTML=pageRows.map(p=>{
    const img=Array.isArray(p.images)&&p.images.length?p.images[0]:p.image;
    const published=p.published!==false;
    const stock=Number(p.stock||0);
    const stockClass=stock<=0?"danger":stock<=5?"warning":"good";
    const stockText=stock<=0?"نفد المخزون":stock<=5?"منخفض":"متوفر";
    const sku=esc(p.sku||String(p.id||"").slice(0,9).toUpperCase());
    return `<article class="product-row">
      <div class="product-image-wrap">
        <label class="product-select-overlay" title="تحديد المنتج"><input type="checkbox" ${selectedProducts.has(p.id)?"checked":""} onchange="window.toggleProductSelection('${esc(p.id)}',this.checked)"></label>
        <img class="product-image" src="${esc(img||"")}" alt="${esc(p.name||"منتج")}" onerror="this.style.display='none'">
      </div>
      <div class="product-details">
        <h3>${esc(p.name||"بدون اسم")}</h3>
        <div class="product-meta" dir="ltr"><b>${sku}</b></div>
      </div>
      <div class="price-stock-col">
        <strong class="product-price">${Number(p.price||0).toLocaleString("ar-DZ")} دج</strong>
        <div class="pills-row">
          <span class="stock-pill ${stockClass}"><i></i>${stock} ${stockText}</span>
          <span class="publish-badge ${published?"is-published":"is-hidden"}" title="اضغط لتبديل حالة توفّر المنتج في المتجر" onclick="toggleProductPublish('${esc(p.id)}')">${published?"● نشط":"● غير متوفر"}</span>
        </div>
      </div>
      <div class="product-actions">
        <details class="product-menu"><summary title="خيارات إضافية">⋮</summary><div class="menu-popover">
          <button type="button" onclick="window.openProductStore('${esc(p.id)}')">👁️ عرض المنتج</button>
          <button type="button" onclick="window.copyProductLink('${esc(p.id)}')">🔗 نسخ الرابط</button>
        </div></details>
        <div class="action-main">
          <button class="icon-action-btn edit-icon bd-btn" type="button" title="تعديل" onclick="editProduct('${esc(p.id)}')">✏️</button>
          <button class="icon-action-btn delete-icon bd-btn" type="button" title="حذف" onclick="removeProduct('${esc(p.id)}')">🗑️</button>
        </div>
      </div>
    </article>`;
  }).join("");
  renderPagination("productsPagination",productsPage,totalPages,"productsPage");updateBulkUi("products");
};

async function compressImageToBlob(file,maxSide=900,quality=0.62){
  if(!file || !file.type.startsWith("image/")) throw new Error("ملف صورة غير صالح");
  if(file.type==="image/gif"){
    // GIFs are converted to a normal JPEG frame to keep Firestore usage small.
  }
  const img=await new Promise((resolve,reject)=>{
    const u=URL.createObjectURL(file);
    const im=new Image();
    im.onload=()=>{URL.revokeObjectURL(u);resolve(im)};
    im.onerror=()=>{URL.revokeObjectURL(u);reject(new Error("تعذر قراءة الصورة"))};
    im.src=u;
  });
  const scale=Math.min(1,maxSide/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
  const w=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));
  const h=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
  const canvas=document.createElement("canvas");
  canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext("2d",{alpha:false});
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,w,h);
  ctx.drawImage(img,0,0,w,h);
  return new Promise(resolve=>canvas.toBlob(b=>resolve(b),"image/jpeg",quality));
}

function setBtnSaving(on){
  if(!saveBtn)return;
  saveBtn.disabled=on||saving;
  saveBtn.innerHTML=on?"⏳ جاري الحفظ...":"💾 حفظ المنتج";
}

// ===== الألوان والقياسات (اختياري): تُحفظ مع المنتج (colors/sizes/shoeSizes) ليختارها
// الزبون في صفحة المنتج قبل الطلب. قياسات الملابس/الأحذية تُعرض كخيارات جاهزة قابلة
// للتفعيل بالنقر، مع إمكانية إضافة قياس مخصّص غير موجود في القائمة الجاهزة. =====
const CLOTHING_SIZE_PRESETS=["XS","S","M","L","XL","XXL","XXXL"];
const SHOE_SIZE_PRESETS=["35","36","37","38","39","40","41","42","43","44","45","46"];
let productColors=[];     // [{name,hex}]
let productSizes=[];      // ["M","L",...] قياسات ملابس
let productShoeSizes=[];  // ["40","41",...] قياسات أحذية

function renderColorChips(){
  const box=document.getElementById("colorChips");
  if(!box) return;
  box.innerHTML=productColors.length
    ? productColors.map((c,i)=>`<span class="variant-chip-color"><span class="dot" style="background:${esc(c.hex||"#cccccc")}"></span>${esc(c.name)}<button type="button" class="variant-chip-remove" onclick="removeColorEntry(${i})" aria-label="حذف اللون">×</button></span>`).join("")
    : '<small class="hint" style="margin:0">لم تُضف ألوان بعد</small>';
}
window.addColorEntry=()=>{
  const nameEl=document.getElementById("colorNameInput");
  const hexEl=document.getElementById("colorHexInput");
  const name=(nameEl?.value||"").trim();
  if(!name) return;
  if(productColors.some(c=>c.name.toLowerCase()===name.toLowerCase())){ if(nameEl)nameEl.value=""; return; }
  productColors.push({name,hex:hexEl?.value||""});
  if(nameEl) nameEl.value="";
  renderColorChips();
};
window.removeColorEntry=i=>{ productColors.splice(i,1); renderColorChips(); };

function renderPresetSizeChips(boxId,presets,selected,toggleFn,removeFn){
  const box=document.getElementById(boxId);
  if(!box) return;
  const custom=selected.filter(s=>!presets.includes(s));
  const presetHtml=presets.map(s=>`<button type="button" class="variant-chip${selected.includes(s)?" active":""}" onclick="${toggleFn}('${esc(s)}')">${esc(s)}</button>`).join("");
  const customHtml=custom.map(s=>`<span class="variant-chip-color">${esc(s)}<button type="button" class="variant-chip-remove" onclick="${removeFn}('${esc(s)}')" aria-label="حذف القياس">×</button></span>`).join("");
  box.innerHTML=presetHtml+customHtml;
}
function renderClothingSizeChips(){ renderPresetSizeChips("clothingSizeChips",CLOTHING_SIZE_PRESETS,productSizes,"toggleClothingSize","removeClothingSize"); }
function renderShoeSizeChips(){ renderPresetSizeChips("shoeSizeChips",SHOE_SIZE_PRESETS,productShoeSizes,"toggleShoeSize","removeShoeSize"); }

window.toggleClothingSize=size=>{
  const i=productSizes.indexOf(size);
  if(i>=0) productSizes.splice(i,1); else productSizes.push(size);
  renderClothingSizeChips();
};
window.removeClothingSize=size=>{ productSizes=productSizes.filter(s=>s!==size); renderClothingSizeChips(); };
window.addClothingSizeFromInput=()=>{
  const el=document.getElementById("clothingSizeInput");
  const v=(el?.value||"").trim();
  if(!v) return;
  if(!productSizes.includes(v)) productSizes.push(v);
  if(el) el.value="";
  renderClothingSizeChips();
};
window.toggleShoeSize=size=>{
  const i=productShoeSizes.indexOf(size);
  if(i>=0) productShoeSizes.splice(i,1); else productShoeSizes.push(size);
  renderShoeSizeChips();
};
window.removeShoeSize=size=>{ productShoeSizes=productShoeSizes.filter(s=>s!==size); renderShoeSizeChips(); };
window.addShoeSizeFromInput=()=>{
  const el=document.getElementById("shoeSizeInput");
  const v=(el?.value||"").trim();
  if(!v) return;
  if(!productShoeSizes.includes(v)) productShoeSizes.push(v);
  if(el) el.value="";
  renderShoeSizeChips();
};

window.save=async()=>{
 if(saving) return;
 saving=true;
 setBtnSaving(true);
 let specifications=[];
 let features=[];
 try{
  specifications=String(specificationsText?.value||"").split("\n").map(s=>s.trim()).filter(Boolean).map(line=>{
    const i=line.indexOf(":");
    return i>0 ? {key:line.slice(0,i).trim(),value:line.slice(i+1).trim()} : {key:line,value:""};
  });
  features=String(featuresText?.value||"").split("\n").map(s=>s.trim()).filter(Boolean);
  const currentPrice=Number(priceInput?.value||0);
  const enteredOldPrice=Number(oldPriceInput?.value||0);
  let data={
    name:nameInput?.value.trim()||"",
    name_fr:nameFrInput?.value.trim()||"",
    // يُحفظ مع كل إضافة/تعديل حتى تتمكن صفحة المنتج من جلب الوثيقة مباشرة
    // (استعلام على حقل slug) بدل تحميل مجموعة products كاملة عند كل زيارة.
    slug:productSlugOf({name:nameInput?.value.trim()||"",name_fr:nameFrInput?.value.trim()||"",id:editing||""}),
    sku:skuInput?.value.trim()||"",
    price:currentPrice,
    oldPrice:enteredOldPrice>currentPrice?enteredOldPrice:0,
    category:categoryInput?.value||"tools",
    stock:Number(stockInput?.value),
    published:publishedInput?.checked!==false,
    featured:featuredInput?.checked===true,
    showOldPrice:showOldPriceInput?.checked!==false,
    showReviews:showReviewsInput?.checked!==false,
    description:descriptionInput?.value.trim()||"",
    description_fr:descriptionFrInput?.value.trim()||"",
    specifications,
    features,
    colors:productColors.slice(),
    sizes:productSizes.slice(),
    shoeSizes:productShoeSizes.slice(),
    deliveryMethod:currentDeliveryMethod(),
    shippingHome:currentDeliveryMethod()==="home"?(shippingHomeSelect?.dataset.value||""):"",
    shippingOffice:currentDeliveryMethod()==="office"?(shippingOfficeSelect?.dataset.value||""):"",
    image:"",
    images:[],
    updatedAt:serverTimestamp()
  };

  if(!data.name||data.price<0||data.stock<0||!selectedImages.length){
    show("أكمل بيانات المنتج المطلوبة وأضف صورة واحدة على الأقل.","err");return;
  }
  if(enteredOldPrice>0 && enteredOldPrice<=currentPrice){
    show("السعر القديم يجب أن يكون أكبر من السعر الحالي حتى يظهر التخفيض.","err");return;
  }

  show("⏳ جاري رفع الصور...","ok");
  // رفع حقيقي إلى Cloudinary (مجاني، بلا اشتراك): كل صورة تُضغط ثم تُرفع وتُرجع رابط https حقيقي
  // (بدل تخزين base64 داخل Firestore) — هذا ما يتطلبه Google Merchant/Product schema.
  const uploaded=new Array(selectedImages.length);
  const tasks=[];
  for(let i=0;i<selectedImages.length && i<10;i++){
    const item=selectedImages[i];
    if(item.existing){ uploaded[i]=item.url; continue; }
    tasks.push({i,file:item.file});
  }
  try{
    // الرفع بالتتابع (وليس بالتوازي) لتفادي رفض Cloudinary للطلبات الكثيرة دفعة واحدة.
    for(const t of tasks){
      const blob=await compressImageToBlob(t.file,1000,0.7);
      uploaded[t.i]=await uploadToCloudinary(blob);
    }
  }catch(e){
    show("فشل رفع الصور: "+(e?.message||"خطأ غير معروف"),"err");
    return;
  }

  data.images=uploaded.filter(Boolean).slice(0,10);
  data.image=data.images[0]||"";

  if(!data.images.length){
    show("أضف صورة واحدة على الأقل للمنتج.","err");return;
  }

  const wasEditing=!!editing;
  if(editing) {
    await updateDoc(doc(db,"products",editing),data);
    const idx=products.findIndex(x=>x.id===editing);
    if(idx>=0) products[idx]={...products[idx],...data};
    // نُبقي المستخدم داخل صفحة تعديل نفس المنتج بعد الحفظ، ونحدّث الصور المرفوعة
    // حديثًا لتصبح "موجودة" حتى لا تُرفع من جديد عند حفظ لاحق لنفس الجلسة.
    selectedImages=data.images.map(u=>({url:u,existing:true,file:null}));
    renderSelectedImages();
  } else {
    // إضافة واحدة فقط مهما ضغط المستخدم على الزر بسرعة.
    data.createdAt=serverTimestamp();
    const newRef=await addDoc(collection(db,"products"),data);
    // المنتج بلا اسم فرنسي واسمه عربي: الرابط يحتاج معرّف الوثيقة (produit-xxxxxx) الذي لا يتوفر إلا بعد الإضافة.
    const finalSlug=productSlugOf({name:data.name,name_fr:data.name_fr,id:newRef.id});
    if(finalSlug!==data.slug){ try{ await updateDoc(newRef,{slug:finalSlug}); data.slug=finalSlug; }catch(_e){} }
    products.push({id:newRef.id,...data,_localCreatedAtSeconds:Math.floor(Date.now()/1000)});
  }

  render();
  updateStats();
  show("تم الحفظ بنجاح ✅","ok");
  // إضافة/تعديل منتج (سعر، تصنيف، نشر...) يُغيّر أيضًا ما يجب أن يظهر في صفحات SEO الثابتة
  // (الرئيسية + /product-category/ + /product/)، تمامًا كما يفعل الحذف. نستخدم نفس الآلية
  // المُجرَّبة أصلاً لحذف المنتجات (بها تأخير قصير يُجمّع حفظات متتالية في تشغيل واحد، ولا
  // ترمي خطأ عند الفشل) بدل الانتظار حتى الـ cron القادم (حتى 6 ساعات).
  window.bazarRefreshSeoAfterDelete();
  if(!wasEditing) resetForm();
 }catch(e){
  console.error(e);
  show("تعذر حفظ المنتج: "+(e.message||"خطأ غير معروف"),"err");
 }finally{
  saving=false;
  setBtnSaving(false);
 }
};
window.editProduct=id=>{
 const p=products.find(x=>x.id===id);
 if(!p)return;
 editing=id;
 titleBox.textContent="✏️ تعديل المنتج";
 nameInput.value=p.name||"";
 if(nameFrInput)nameFrInput.value=p.name_fr||"";
 if(skuInput)skuInput.value=p.sku||"";
 priceInput.value=p.price??"";
 if(oldPriceInput)oldPriceInput.value=p.oldPrice??p.compareAtPrice??"";
 renderCategorySelect(p.category||categories[0]?.key||"tools");
 stockInput.value=p.stock??"";
 if(showOldPriceInput)showOldPriceInput.checked=p.showOldPrice!==false;
 if(showReviewsInput)showReviewsInput.checked=p.showReviews!==false;
 if(featuredInput)featuredInput.checked=p.featured===true;
 descriptionInput.value=p.description||"";
 if(descriptionFrInput)descriptionFrInput.value=p.description_fr||"";
 if(specificationsText){
   const specs=Array.isArray(p.specifications)?p.specifications:[];
   specificationsText.value=specs.map(x=>x&&x.key?`${x.key}: ${x.value??""}`:String(x||"")).join("\n");
 }
 if(featuresText){
   const features=Array.isArray(p.features)?p.features:(Array.isArray(p.highlights)?p.highlights:[]);
   featuresText.value=features.map(x=>typeof x==="string"?x:(x?.text||x?.name||"")).filter(Boolean).join("\n");
 }
 productColors=Array.isArray(p.colors)?p.colors.filter(c=>c&&c.name).map(c=>({name:String(c.name),hex:String(c.hex||"")})):[];
 productSizes=Array.isArray(p.sizes)?p.sizes.filter(Boolean).map(String):[];
 productShoeSizes=Array.isArray(p.shoeSizes)?p.shoeSizes.filter(Boolean).map(String):[];
 renderColorChips();renderClothingSizeChips();renderShoeSizeChips();
 const imgs=Array.isArray(p.images)&&p.images.length?p.images:[p.image].filter(Boolean);
 selectedImages=imgs.slice(0,10).map(u=>({url:u,existing:true,file:null}));
 renderSelectedImages();
 setMultiSelectValue(shippingHomeSelect,p.shippingHome||"");
 setMultiSelectValue(shippingOfficeSelect,p.shippingOffice||"");
 // منتجات قديمة بدون طريقة توصيل محفوظة: نخمّن الطريقة من البيانات الموجودة حتى لا تتعطل عند التعديل.
 setDeliveryMethod(p.deliveryMethod||((!p.shippingHome&&p.shippingOffice)?"office":"home"));
 document.getElementById("backToProductsBtn")?.classList.remove("hidden");
 try{sessionStorage.setItem("bazarAdminView","product");sessionStorage.setItem("bazarEditingProduct",id);}catch(e){}
 showView("product",document.querySelector('.nav-item[data-view="product"]'),false);
 try{
   const url=new URL(window.location.href);
   url.searchParams.set("view","product");
   url.searchParams.set("id",id);
   window.history.replaceState({adminView:"product",productId:id},"",url.pathname+url.search+url.hash);
 }catch(e){}
 scrollTo({top:0,behavior:"smooth"});
};

window.toggleProductPublish=async id=>{
  const p=products.find(x=>x.id===id);
  if(!p)return;
  const next=p.published===false;
  try{
    await updateDoc(doc(db,"products",id),{published:next,updatedAt:serverTimestamp()});
    p.published=next; render(); updateStats();
    show(next?"تم نشر المنتج في المتجر ✅":"تم إيقاف نشر المنتج ✅","ok");
    // نشر/إخفاء منتج يُغيّر أيضًا صفحات SEO الثابتة (نفس منطق التعليق أعلاه في حفظ المنتج).
    window.bazarRefreshSeoAfterDelete();
  }catch(e){show("تعذر تغيير حالة النشر: "+(e.message||"خطأ غير معروف"),"err");}
};
window.removeProduct=async id=>{
 let p=products.find(x=>x.id===id);
 if(p&&confirm("حذف "+p.name+"؟"))try{
   await deleteDoc(doc(db,"products",id));
   products=products.filter(x=>x.id!==id);
   selectedProducts.delete(id);
   render();
   updateStats();
   show("تم الحذف ✅","ok");
   window.bazarRefreshSeoAfterDelete();
 }catch(e){show("تعذر الحذف.","err")}
};

window.resetForm=()=>{
 editing=null;
 titleBox.textContent="➕ إضافة منتج";
 nameInput.value="";if(nameFrInput)nameFrInput.value="";if(skuInput)skuInput.value="";priceInput.value="";if(oldPriceInput)oldPriceInput.value="";
 renderCategorySelect(categories[0]?.key||"tools");stockInput.value="";
 if(showOldPriceInput)showOldPriceInput.checked=true;
 if(showReviewsInput)showReviewsInput.checked=true;
 if(publishedInput)publishedInput.checked=true;if(featuredInput)featuredInput.checked=false;descriptionInput.value="";if(descriptionFrInput)descriptionFrInput.value="";
 if(specificationsText) specificationsText.value="";
 if(featuresText) featuresText.value="";
 productColors=[];productSizes=[];productShoeSizes=[];
 renderColorChips();renderClothingSizeChips();renderShoeSizeChips();
 selectedImages=[];
 setMultiSelectValue(shippingHomeSelect,"");
 setMultiSelectValue(shippingOfficeSelect,"");
 setDeliveryMethod("home");
 document.getElementById("backToProductsBtn")?.classList.add("hidden");
 try{sessionStorage.removeItem("bazarEditingProduct");}catch(e){}
 renderSelectedImages();
};
window.backToProductsList=function(){
 showView("products",document.querySelector('.nav-item[data-view="products"]'),false,true);
};

window.renderSelectedImages=()=>{
  if(!imagePreviewBox||!imageCountBox)return;
  imageCountBox.textContent=`${selectedImages.length} / 10 صور`;
  imagePreviewBox.innerHTML=selectedImages.map((x,i)=>`
    <div class="image-item">
      <div class="image-wrap">
        <img class="image-thumb" src="${esc(x.url)}" onerror="this.style.opacity=.35">
        <button type="button" class="image-remove" onclick="removeSelectedImage(${i})">×</button>
        ${i===0?'<span class="cover-badge">واجهة</span>':''}
      </div>
      <small>${i===0?"الصورة الرئيسية":"صورة "+(i+1)}</small>
    </div>`).join("");
};
window.removeSelectedImage=i=>{
  const item=selectedImages[i];
  if(item?.file && item.url?.startsWith("blob:")) URL.revokeObjectURL(item.url);
  selectedImages.splice(i,1);
  renderSelectedImages();
};
renderSelectedImages();

function show(t,c){statusBox.textContent=t;statusBox.className="status "+c;setTimeout(()=>statusBox.className="status hidden",3500)}
function esc(v){return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
// ⚠️ esc() وحدها غير كافية لقيم تُمرَّر كوسيط JS بين علامتي اقتباس أحاديتين ' '
// داخل onclick="..." (مثل اسم الزبون الحر النص): المتصفح يفكّ ترميز &#039; إلى
// ' فعليًا قبل تنفيذ كود onclick، فيكسر السلسلة النصية إذا كان الاسم يحتوي على
// فاصلة عليا (مثال: اسم فيه ' أو Apostrophe). هذه الدالة تُنتج نصًا يبقى سليمًا
// داخل onclick="...('...')" حتى لو احتوت القيمة على ' أو \.
function escJs(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("\\","\\\\").replaceAll("'","\\'")}

