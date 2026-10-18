import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MapPin, Search, Copy, ExternalLink, Images, Globe2, Leaf, X, RefreshCw } from 'lucide-react';
import './style.css';
import './gallery-enhancements.css';
import { taiwanTimeDifference } from './timezone';
import { countryOptions } from './country-options';
import {paginate, paginationMarks, POSTCARDS_PER_PAGE} from './pagination';
import {sortPostcards} from './postcard-order';
import {DuplicateReportPicker} from './duplicate-report-picker';
import {postcardImageUrl} from './postcard-image';

const workerBase = 'https://minmay-upload.retne501-minmay.workers.dev';
const sessionKey = 'minmay_web_owner_session';
// Do not enable on GitHub Pages until public JSON/image paths have been retired.
// An authenticated UI alone cannot make public GitHub content private.
const privateGalleryReady = import.meta.env.VITE_PRIVATE_GALLERY_READY === 'true';
type OwnerInfo = {ok:boolean;ownedIds:string[];sharedEditableIds:string[]};
type DuplicateReport = {id:string;duplicateOfId:string;reportedAt:number};
async function ownerApi<T>(path:string, body?:unknown, token?:string):Promise<T> {
  const result=await fetch(workerBase+path,{
    method:body===undefined?'GET':'POST',
    mode:'cors',cache:'no-store',
    headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'Authorization':'Bearer '+token}:{})},
    ...(body!==undefined?{body:JSON.stringify(body)}:{})
  });
  const data:unknown=await result.json();
  if(!result.ok)throw Error('網站授權或操作失敗（'+result.status+'）');
  return data as T;
}
async function toWebpBase64(file:File):Promise<string> {
  const image=await createImageBitmap(file);
  try {
    const longest=Math.max(image.width,image.height);
    const scale=Math.min(1,1600/longest);
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.width*scale));
    canvas.height=Math.max(1,Math.round(image.height*scale));
    const context=canvas.getContext('2d');
    if(!context)throw Error('無法處理圖片');
    context.drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',0.78));
    if(!blob||blob.type!=='image/webp'||blob.size>2_000_000)throw Error('WebP 圖片無法壓縮至 2MB 以下');
    return await new Promise<string>((resolve,reject)=>{
      const reader=new FileReader();
      reader.onerror=()=>reject(Error('讀取圖片失敗'));
      reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');
      reader.readAsDataURL(blob);
    });
  } finally {image.close()}
}

type Postcard = {
  id: string; imageUrl: string; signedImageUrl?: string; imageStorage?: string; coordinates: {lat: number; lng: number};
  source?: 'mushroom' | 'flower' | 'detector';
  sources?: ('mushroom' | 'flower' | 'detector')[];
  category?: string;
  favorite?: 0 | 1;
  location: {countryCode: string; countryName: string; city: string; district: string; landmark?: string};
  createdAt: string;
  uploadedBy?: string; uploadedAt?: string;
  externalSource?: {site:string;postcardId:string;nameOnSource?:string;originalImageUrl?:string};
};
function flag(code: string) {
  if (!/^[A-Z]{2}$/.test(code)) return '🌐';
  return [...code].map(c => String.fromCodePoint(c.charCodeAt(0) + 127397)).join('');
}
function displayLocation(p: Postcard) {
  return [p.location.city, p.location.district].filter(Boolean).join(' · ') || '尚未標記城市';
}
const demo: Postcard[] = [
  {id:'demo-1',source:'mushroom',imageUrl:'',coordinates:{lat:22.6204,lng:120.312},location:{countryCode:'TW',countryName:'台灣',city:'高雄市',district:'苓雅區',landmark:'光榮碼頭'},createdAt:'2026-10-16T18:30:22+08:00'},
  {id:'demo-2',source:'flower',imageUrl:'',coordinates:{lat:35.6586,lng:139.7454},location:{countryCode:'JP',countryName:'日本',city:'東京都',district:'港區',landmark:'東京鐵塔'},createdAt:'2026-09-20T11:00:00+09:00'},
  {id:'demo-3',source:'detector',imageUrl:'',coordinates:{lat:25.0339,lng:121.5645},location:{countryCode:'TW',countryName:'台灣',city:'臺北市',district:'信義區',landmark:'台北101'},createdAt:'2026-08-08T12:30:00+08:00'}
];
// UI labels only. Persisted source values and Android/Worker API stay unchanged.
const sourceNames: Record<string,string> = {mushroom:'🍄 打菇',flower:'🌸 花點',detector:'🧭 探險'};
type SourceType = 'mushroom' | 'flower' | 'detector';
const availableSources: SourceType[] = ['mushroom','flower','detector'];
function getSources(p:Postcard):SourceType[] {
  if(Array.isArray(p.sources))return availableSources.filter(value=>p.sources?.includes(value));
  return p.source&&availableSources.includes(p.source)?[p.source]:[];
}
function sourceLabel(p:Postcard){return getSources(p).map(value=>sourceNames[value]).join(' · ')||'未分類'}
const detailCategories = ['風景','動漫','搞笑','恐怖','節慶','動物','建築','壁畫','其他'];
const sourceTabs = [
  {value:'全部來源', label:'全部', icon:'✿'},
  {value:'flower', label:'花點', icon:'🌸'},
  {value:'mushroom', label:'打菇', icon:'🍄'},
  {value:'detector', label:'探險', icon:'🧭'},
] as const;
function App() {
  const [records,setRecords]=useState<Postcard[]>([]);
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),60_000);return ()=>window.clearInterval(timer)},[]);
  const [refreshing,setRefreshing]=useState(false);
  const [lastRefreshed,setLastRefreshed]=useState<Date|null>(null);
  const refreshingRef=useRef(false);
  const [demoMode,setDemoMode]=useState(false);
  const [error,setError]=useState('');
  const [query,setQuery]=useState('');
  const [country,setCountry]=useState('全部國家');
  const [source,setSource]=useState('全部來源');
  const [categoryFilter,setCategoryFilter]=useState('全部類別');
  const [selectedUploaders,setSelectedUploaders]=useState<string[]>([]);
  const [selectedHearts,setSelectedHearts]=useState<number[]>([0,1]);
  const [page,setPage]=useState(1);
  const collectionRef=useRef<HTMLDivElement|null>(null);
  const [selected,setSelected]=useState<Postcard|null>(null);
  const [copiedId,setCopiedId]=useState<string|null>(null);
  const [copyFeedback,setCopyFeedback]=useState('');
  const [ownerToken,setOwnerToken]=useState<string|null>(null);
  const [galleryAuthorized,setGalleryAuthorized]=useState(false);
  const [authLoading,setAuthLoading]=useState(true);
  const [ownedIds,setOwnedIds]=useState<string[]>([]);
  const [sharedEditableIds,setSharedEditableIds]=useState<string[]>([]);
  const [reports,setReports]=useState<DuplicateReport[]>([]);
  const [reportTarget,setReportTarget]=useState<Postcard|null>(null);
  const [duplicateOfId,setDuplicateOfId]=useState('');
  const [ownerMessage,setOwnerMessage]=useState('管理自己的明信片：請先在 MinMay App 點「管理我的明信片」一鍵登入');
  const [ownerBusy,setOwnerBusy]=useState(false);
  const [editImageFor,setEditImageFor]=useState<Postcard|null>(null);
  const [editingCard,setEditingCard]=useState<Postcard|null>(null);
  const imagePicker=useRef<HTMLInputElement|null>(null);
  const exchanging=useRef(false);
  useEffect(()=>{
    const match=window.location.hash.match(/^#minmay-login=([a-f0-9]{64})$/);
    // Remove the single-use ticket from the browser address/history before requesting the exchange.
    if(match){
      window.history.replaceState(null,'',window.location.pathname+window.location.search);
      if(exchanging.current)return;
      exchanging.current=true;
      setOwnerMessage('正在驗證 App 一鍵登入…');
      void ownerApi<{token:string}>('/web/exchange',{ticket:match[1]}).then(result=>{
        sessionStorage.setItem(sessionKey,result.token);
        setOwnerToken(result.token);
      }).catch(()=>{
        setOwnerMessage('一鍵登入憑證無效或已過期，請從 MinMay App 再按一次「管理我的明信片」。');
        setAuthLoading(false);
      });
    }else{
      const previous=sessionStorage.getItem(sessionKey);
      if(previous)setOwnerToken(previous);
      else setAuthLoading(false);
    }
  },[]);
  useEffect(()=>{
    if(!ownerToken){
      setOwnedIds([]);setSharedEditableIds([]);setReports([]);
      setGalleryAuthorized(false);setRecords([]);setSelected(null);
      if(!exchanging.current)setAuthLoading(false);
      return;
    }
    setAuthLoading(true);
    setGalleryAuthorized(false);
    let current=true;
    void Promise.all([
      ownerApi<OwnerInfo>('/web/me',undefined,ownerToken),
      ownerApi<{ok:boolean;reports:DuplicateReport[]}>('/web/duplicates',undefined,ownerToken)
    ]).then(([data,reportList])=>{
      if(!current)return;
      setOwnedIds(data.ownedIds);
      setSharedEditableIds(data.sharedEditableIds||[]);
      setReports(reportList.reports);
      setGalleryAuthorized(true);
      setAuthLoading(false);
      setOwnerMessage(`已登入：自己的 ${data.ownedIds.length} 張可管理，另有 ${data.sharedEditableIds?.length||0} 張共用明信片可編輯`);
    }).catch(()=>{
      if(!current)return;
      sessionStorage.removeItem(sessionKey);
      setOwnerToken(null);
      setGalleryAuthorized(false);
      setAuthLoading(false);
      setOwnerMessage('網站授權已失效，請從 MinMay App 再次一鍵登入。');
    });
    return ()=>{current=false};
  },[ownerToken]);
  const refreshRecords=useCallback(async()=>{
    if(refreshingRef.current||(privateGalleryReady&&(!galleryAuthorized||!ownerToken))) return;
    refreshingRef.current=true;
    setRefreshing(true);
    try {
      const data:unknown=privateGalleryReady
        ? (await ownerApi<{ok:boolean;cards:unknown}>('/web/gallery',undefined,ownerToken!)).cards
        : await (async()=>{
          const response=await fetch(`${import.meta.env.BASE_URL}data/postcards.json?refresh=${Date.now()}`,{cache:'no-store'});
          if(!response.ok)throw new Error(`HTTP ${response.status}`);
          return response.json() as Promise<unknown>;
        })();
      if(!Array.isArray(data)) throw new Error('資料格式不是陣列');
      setRecords(data as Postcard[]);
      setSelected(previous=>previous ? (data as Postcard[]).find(p=>p.id===previous.id)||null : null);
      setError('');
      setLastRefreshed(new Date());
    } catch(error) {
      if(privateGalleryReady&&error instanceof Error && error.message.includes('401')){
        sessionStorage.removeItem(sessionKey);
        setOwnerToken(null);
      }
      setError(`讀取明信片失敗：${String(error instanceof Error?error.message:error)}`);
    } finally {
      refreshingRef.current=false;
      setRefreshing(false);
    }
  },[galleryAuthorized,ownerToken]);
  useEffect(()=>{
    if(privateGalleryReady&&!galleryAuthorized)return;
    void refreshRecords();
    const onForeground=()=>{if(document.visibilityState==='visible')void refreshRecords()};
    document.addEventListener('visibilitychange',onForeground);
    window.addEventListener('focus',onForeground);
    // Gallery tickets and path-bound image URLs have short lifetimes. Refresh
    // while the tab remains open so already loaded pages do not keep expired
    // signatures; a 401 will clear the member session and displayed records.
    const timer=privateGalleryReady ? window.setInterval(()=>void refreshRecords(),5*60_000) : null;
    return ()=>{
      document.removeEventListener('visibilitychange',onForeground);
      window.removeEventListener('focus',onForeground);
      if(timer!==null)window.clearInterval(timer);
    };
  },[refreshRecords,galleryAuthorized]);
  const items=demoMode?demo:records;
  const countries=useMemo(()=>countryOptions(items,now), [items,now]);
  const categories=useMemo(()=>['全部類別',...new Set(items.map(x=>x.category).filter((value):value is string=>Boolean(value)))], [items]);
  const uploaders=useMemo(()=>Array.from(new Set(items.map(x=>x.uploadedBy||'未知'))).sort((a,b)=>a.localeCompare(b,'zh-TW')),[items]);
  const filtered=useMemo(()=>items.filter(x=>{
    const txt=[x.location.countryName,x.location.city,x.location.district,x.location.landmark,x.category,x.uploadedBy,x.id].join(' ').toLowerCase();
    return (country==='全部國家'||x.location.countryName===country)&&(source==='全部來源'||getSources(x).includes(source as SourceType))&&(categoryFilter==='全部類別'||x.category===categoryFilter)&&(selectedUploaders.length===0||selectedUploaders.includes(x.uploadedBy||'未知'))&&selectedHearts.includes(x.favorite===1?1:0)&&txt.includes(query.trim().toLowerCase());
  }),[items,country,source,categoryFilter,selectedUploaders,selectedHearts,query]);
  const ordered=useMemo(()=>sortPostcards(filtered,countries,country),[filtered,countries,country]);
  const paged=useMemo(()=>paginate(ordered,page),[ordered,page]);
  // A card may be removed while the user is on the last page.
  useEffect(()=>setPage(previous=>Math.min(previous,paged.totalPages)),[paged.totalPages]);
  const changePage=(next:number)=>{
    const valid=Math.min(Math.max(next,1),paged.totalPages);
    if(valid===paged.page)return;
    setPage(valid);
    collectionRef.current?.scrollIntoView({behavior:'smooth',block:'start'});
  };
  const countryAndDifference=(x:Postcard)=>{
    const difference=taiwanTimeDifference(x.coordinates.lat,x.coordinates.lng,now);
    return `${flag(x.location.countryCode)} ${x.location.countryName}${difference===null?'':` ${difference}`}`;
  };
  const mapUrl=(x:Postcard)=>`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${x.coordinates.lat},${x.coordinates.lng}`)}`;
  const imageUrl=(x:Postcard)=>privateGalleryReady
    ? (/^https:\/\/minmay-upload\.retne501-minmay\.workers\.dev\/images\/postcards\/[A-Za-z0-9_-]+\.(?:webp|jpe?g|png)\?exp=\d+&sig=[A-Za-z0-9_-]+$/.test(x.signedImageUrl||'')?x.signedImageUrl!:'')
    : postcardImageUrl(x,import.meta.env.BASE_URL);
  const copyCoordinates=async (x:Postcard)=>{
    try {
      await navigator.clipboard.writeText(`${x.coordinates.lat}, ${x.coordinates.lng}`);
      setCopiedId(x.id);
      setCopyFeedback(`已複製 ${x.location.landmark||x.location.city||'明信片'} 的座標`);
    } catch {
      setCopiedId(null);
      setCopyFeedback('無法複製座標，請確認瀏覽器剪貼簿權限，或點開明信片手動複製。');
    }
  };
  const replaceImage=async(file:File|null)=>{
    const postcard=editImageFor;
    setEditImageFor(null);
    if(!postcard||!file||!ownerToken||ownerBusy)return;
    setOwnerBusy(true);
    setOwnerMessage('正在壓縮並更換圖片…');
    try {
      const imageBase64=await toWebpBase64(file);
      const result=await ownerApi<{ok:boolean;imageUrl:string;imageStorage:'r2'|'github'}>('/web/postcards/replace',{id:postcard.id,imageBase64},ownerToken);
      // The previous 15-minute URL is signed for the OLD picture path. After
      // replacing in private mode, immediately get new per-image signatures
      // from the authenticated Worker rather than retaining the stale URL.
      if(privateGalleryReady){
        await refreshRecords();
        setSelected(null);
      }else{
        setRecords(previous=>previous.map(item=>item.id===postcard.id?{...item,imageUrl:result.imageUrl,imageStorage:result.imageStorage}:item));
      }
      setOwnerMessage(result.imageStorage==='r2'
        ? '圖片已更換。'
        : '圖片已更換。GitHub Pages 公開部署可能需要短暫等待。');
    } catch(error) {setOwnerMessage('更換圖片失敗：'+String(error instanceof Error?error.message:error))}
    finally {setOwnerBusy(false);if(imagePicker.current)imagePicker.current.value=''}
  };
  const saveEdit=async()=>{
    if(!editingCard||!ownerToken||ownerBusy)return;
    const current=editingCard;
    if(!Number.isFinite(current.coordinates.lat)||!Number.isFinite(current.coordinates.lng)||
      Math.abs(current.coordinates.lat)>90||Math.abs(current.coordinates.lng)>180){
      setOwnerMessage('經緯度超出範圍，請重新確認。');return;
    }
    if(getSources(current).length===0){setOwnerMessage('請至少選擇一種明信片來源。');return}
    setOwnerBusy(true);
    try{
      const changes={
        sources:getSources(current),
        favorite:current.favorite===1?1:0,
        ...(current.category?{category:current.category}:{}),
        coordinates:current.coordinates,location:current.location
      };
      const result=await ownerApi<{ok:boolean;record:Postcard}>('/web/postcards/edit',{id:current.id,changes},ownerToken);
      // A record update response intentionally excludes signed image URLs.
      // Re-fetch the private gallery to preserve authorized picture display.
      if(privateGalleryReady)await refreshRecords();
      else{
        setRecords(previous=>previous.map(item=>item.id===current.id?result.record:item));
        setSelected(previous=>previous?.id===current.id?result.record:previous);
      }
      setEditingCard(null);
      setOwnerMessage('明信片資料已儲存，公開網站更新可能需要短暫等待。');
    }catch(error){setOwnerMessage('編輯失敗：'+String(error instanceof Error?error.message:error))}
    finally{setOwnerBusy(false)}
  };
  const updateEditLocation=(field:keyof Postcard['location'],value:string)=>{
    setEditingCard(previous=>previous?{...previous,location:{...previous.location,[field]:value}}:previous);
  };
  const unpublish=async(postcard:Postcard)=>{
    if(!ownerToken||ownerBusy)return;
    if(!window.confirm('確定要從公開圖鑑下架這張明信片嗎？共用明信片也會讓其他朋友無法再看到。原圖會保留供管理員協助復原。'))return;
    setOwnerBusy(true);
    try {
      await ownerApi('/web/postcards/unpublish',{id:postcard.id},ownerToken);
      setRecords(previous=>previous.filter(item=>item.id!==postcard.id));
      setOwnedIds(previous=>previous.filter(id=>id!==postcard.id));
      setSelected(null);
      setOwnerMessage('明信片已下架。公開網站更新可能需要短暫等待。');
    } catch(error) {setOwnerMessage('下架失敗：'+String(error instanceof Error?error.message:error))}
    finally {setOwnerBusy(false)}
  };
  const reportDuplicate=async()=>{
    if(!ownerToken||!reportTarget||!duplicateOfId||ownerBusy)return;
    const target=reportTarget;
    setOwnerBusy(true);
    try {
      const response=await ownerApi<{reportedAt:number;duplicateOfId:string}>('/web/duplicates/report',
        {id:target.id,duplicateOfId},ownerToken);
      setReports(previous=>[...previous.filter(r=>r.id!==target.id),{
        id:target.id,duplicateOfId:response.duplicateOfId,reportedAt:response.reportedAt
      }]);
      setOwnerMessage('已回報重複明信片：超過 7 天後由每 3 天的排程檢查；下架前任何有效邀請碼使用者都可取消。');
      setReportTarget(null);setDuplicateOfId('');
    } catch(error){setOwnerMessage('回報失敗：'+String(error instanceof Error?error.message:error))}
    finally{setOwnerBusy(false)}
  };
  const cancelDuplicate=async(id:string)=>{
    if(!ownerToken||ownerBusy)return;
    if(!window.confirm('取消這張明信片的重複回報？取消後不會因本次回報自動下架。'))return;
    setOwnerBusy(true);
    try{
      await ownerApi('/web/duplicates/cancel',{id},ownerToken);
      setReports(previous=>previous.filter(r=>r.id!==id));
      setOwnerMessage('已取消重複回報。');
    }catch(error){setOwnerMessage('取消回報失敗：'+String(error instanceof Error?error.message:error))}
    finally{setOwnerBusy(false)}
  };
  if(privateGalleryReady&&!galleryAuthorized){
    return <main>
      <header className="hero"><div className="topline"><span className="brand"><Leaf size={21}/> Garden Scrapbook</span><span className="topbadge">MINMAY MEMBERS</span></div>
        <div className="heroInside"><div className="eyebrow">✦ 朋友專屬的明信片旅行日記 ✦</div><h1>美明<span>手帳</span><span className="flower">✿</span></h1><p>把旅途中遇見的美好收藏起來，和被邀請的朋友分享。</p></div>
      </header>
      <div className="contents"><section className="empty" aria-live="polite"><div className="emptyIcon">✉</div><h3>{authLoading?'正在驗證會員身分…':'明信片圖鑑僅限已授權會員'}</h3><p>{authLoading?'請稍候，正在確認 App 帶入的一次性身分授權。':'請先在白鹿MayMin App 啟用邀請碼，再點「開啟明美圖鑑」自動登入。'}</p>{!authLoading&&<p role="status">{ownerMessage}</p>}</section></div>
      <footer>Made with ♡ & tiny flowers · Pikmin Postcards</footer>
    </main>;
  }
  return <main>
    <header className="hero"><div className="topline"><span className="brand"><Leaf size={21}/> Garden Scrapbook</span><span className="topbadge">PIKMIN POSTCARD JOURNAL</span></div>
      <div className="heroInside"><div className="stampMark">✿<small>little<br/>moments</small></div><div className="eyebrow">✦ 我的明信片旅行日記 ✦</div><h1>美明<span>手帳</span><span className="flower">✿</span></h1><p>把旅途中遇見的美好收藏起來，讓每張明信片都成為故事。</p>
      <div className="stats"><div><b>{items.length}</b><span>張收藏</span></div><i/><div><b>{new Set(items.map(x=>x.location.countryCode)).size}</b><span>個國家</span></div><i/><div><b>{new Set(items.map(x=>`${x.location.countryCode}/${x.location.city}`)).size}</b><span>座城市</span></div></div></div>
    </header>
    <div className="contents"><div className="ownerBar" role="status"><span>🔐 {ownerMessage}</span>{ownerToken&&<button type="button" onClick={()=>{sessionStorage.removeItem(sessionKey);setOwnerToken(null);setOwnerMessage("已登出網站。下次可從 App 一鍵登入。")}}>登出網站管理</button>}</div><input ref={imagePicker} type="file" accept="image/*" className="ownerFileInput" aria-label="挑選替換明信片圖片" onChange={event=>void replaceImage(event.target.files?.[0]||null)}/><div className="sectionHead" ref={collectionRef}><div><div className="miniTitle">MEMORIES COLLECTION</div><h2>旅行的碎片 <span>✳</span></h2><p>每一張郵票，都是一段特別的回憶。</p></div><span className="count">{filtered.length} 張明信片</span></div>
    <nav className="sourceTabs" role="tablist" aria-label="明信片來源分類">
      {sourceTabs.map(tab=><button key={tab.value} type="button" role="tab" aria-selected={source===tab.value} className={`sourceTab${source===tab.value?' active':''}`} onClick={()=>{setSource(tab.value);setPage(1)}}><span aria-hidden="true">{tab.icon}</span><span>{tab.label}</span></button>)}
    </nav>
    <div className="toolbar"><label className="search"><Search size={18}/><input aria-label="搜尋明信片" placeholder="搜尋城市、地區、類別或地標..." value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}}/></label><label className="selectWrap"><Globe2 size={18}/><select aria-label="篩選國家（相對台灣時差由小至大排序）" title="相對台灣的目前時差（小時，包含夏令時間），由小到大排序" value={country} onChange={e=>{setCountry(e.target.value);setPage(1)}}>{countries.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select></label><label className="selectWrap"><Leaf size={18}/><select aria-label="篩選類別" value={categoryFilter} onChange={e=>{setCategoryFilter(e.target.value);setPage(1)}}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><details className="multiFilter"><summary>上傳者{selectedUploaders.length?`（${selectedUploaders.length}）`: '（全部）'}</summary><div className="multiFilterOptions"><button type="button" onClick={()=>{setSelectedUploaders([]);setPage(1)}}>全部上傳者</button>{uploaders.map(name=><label key={name}><input type="checkbox" checked={selectedUploaders.includes(name)} onChange={e=>{setSelectedUploaders(previous=>e.target.checked?[...previous,name]:previous.filter(x=>x!==name));setPage(1)}}/>{name}</label>)}</div></details><details className="multiFilter"><summary>愛心{selectedHearts.length===2?'（全部）':selectedHearts.length===0?'（未選）':selectedHearts[0]===1?'（❤️）':'（無愛心）'}</summary><div className="multiFilterOptions">{[1,0].map(value=><label key={value}><input type="checkbox" checked={selectedHearts.includes(value)} onChange={e=>{setSelectedHearts(previous=>e.target.checked?[...previous,value]:previous.filter(x=>x!==value));setPage(1)}}/>{value===1?'❤️ 有愛心':'♡ 無愛心'}</label>)}</div></details><button className="refreshGallery" type="button" disabled={refreshing} onClick={()=>void refreshRecords()}><RefreshCw size={16} className={refreshing?'spin':''}/>{refreshing?'更新中…':'重新整理圖鑑'}</button></div>
    {lastRefreshed&&<p className="refreshStatus" role="status">最後讀取：{lastRefreshed.toLocaleTimeString('zh-TW')} · 剛上傳的明信片可能需等待 GitHub Pages 部署完成</p>}
    {copyFeedback&&<p className="copyFeedback" role="status">{copyFeedback}</p>}
    {error&&<p className="error" role="alert">{error}</p>}
    {items.length===0&&!error&&<section className="empty"><div className="emptyIcon">✉</div><h3>還沒有收藏明信片</h3><p>從 Android 上傳第一張 Pikmin Bloom 明信片，開始你的收藏旅程吧。</p><button onClick={()=>{setDemoMode(true);setCountry('全部國家');setPage(1)}}>預覽示範版型</button></section>}
    {demoMode&&<div className="demoBar">正在預覽示範資料，這些資料不會寫入 GitHub。 <button onClick={()=>{setDemoMode(false);setCountry('全部國家');setPage(1)}}>返回真實資料</button></div>}
    {items.length>0&&filtered.length===0&&<p className="none">找不到符合條件的明信片，試試別的關鍵字。</p>}
    <div className="cards">{paged.items.map((x,i)=><article className="postcard" key={x.id} style={{'--tilt':`${((i+(paged.page-1)*POSTCARDS_PER_PAGE)%5-2)*1.15}deg`} as React.CSSProperties}>
      <button className="cardClick" aria-label={`查看 ${x.location.landmark||x.location.city||x.location.countryName}`} onClick={()=>setSelected(x)}><div className="picture">{imageUrl(x)?<img src={imageUrl(x)} referrerPolicy="no-referrer" alt={x.location.landmark||`${x.location.countryName}明信片`} loading="lazy"/>:<div className="picturePlaceholder"><Images size={44}/><span>POSTCARD</span></div>}<span className="cornerStamp">{flag(x.location.countryCode)}</span></div><div className="body"><div className="place">{x.location.landmark||x.location.city||x.location.countryName||'未命名的旅途'}</div><div className="geo"><MapPin size={14}/>{displayLocation(x)}</div><div className="foot"><span title="與台灣目前的時差（小時，含夏令時間）">{countryAndDifference(x)}</span><time>{new Date(x.createdAt).toLocaleDateString('zh-TW',{timeZone:'UTC'})}</time> <span>{sourceLabel(x)}</span>{x.category&&<span className="categoryLabel">{x.category}</span>}{x.favorite===1&&<span aria-label="喜愛的明信片">❤️</span>}</div><div className="uploaderMeta">上傳者：{x.uploadedBy||'未知'}{x.externalSource&&<span className="externalCredit"> · 引用自外部明信片資料</span>}</div></div></button>
      <div className="cardActions"><button type="button" className="copyCoordinates" onClick={()=>void copyCoordinates(x)} aria-label={`複製 ${x.location.landmark||x.location.city||'明信片'} 的座標`}><Copy size={15}/>{copiedId===x.id?'已複製':'複製座標'}</button>{ownerToken&&!demoMode&&<div className="duplicateActions">{reports.some(r=>r.id===x.id)?<><span className="duplicatePending">已回報重複 · ${(() => {const row=reports.find(r=>r.id===x.id);return row?new Date(row.reportedAt).toLocaleDateString('zh-TW'):'待處理'})()} · 7 天後進入下架檢查</span><button type="button" disabled={ownerBusy} onClick={()=>void cancelDuplicate(x.id)}>取消重複回報</button></>:<button type="button" disabled={ownerBusy} onClick={()=>{setReportTarget(x);setDuplicateOfId('')}}>回報重複明信片</button>}</div>}{(ownedIds.includes(x.id)||sharedEditableIds.includes(x.id))&&<div className="ownerActions"><button type="button" disabled={ownerBusy} onClick={()=>setEditingCard({...structuredClone(x),sources:getSources(x)})}>編輯資料</button><button type="button" disabled={ownerBusy} onClick={()=>{setEditImageFor(x);imagePicker.current?.click()}}>更換圖片</button>{(ownedIds.includes(x.id)||sharedEditableIds.includes(x.id))&&<button type="button" disabled={ownerBusy} className="ownerDelete" onClick={()=>void unpublish(x)}>刪除</button>}{sharedEditableIds.includes(x.id)&&!ownedIds.includes(x.id)&&<span className="sharedHint">共用管理 · 可編輯及下架</span>}</div>}</div>
    </article>)}</div>
    {filtered.length>0&&<nav className="pagination" aria-label="明信片分頁">
      <p className="paginationSummary" aria-live="polite">顯示第 {paged.from}–{paged.to} 張／共 {paged.total} 張（每頁 {POSTCARDS_PER_PAGE} 張）</p>
      <div className="paginationButtons">
        <button type="button" className="pageStep" disabled={paged.page===1} onClick={()=>changePage(paged.page-1)} aria-label="上一頁">‹ 上一頁</button>
        {paginationMarks(paged.page,paged.totalPages).map((mark,i)=>mark==='ellipsis'
          ? <span className="pageEllipsis" key={`ellipsis-${i}`} aria-hidden="true">…</span>
          : <button type="button" key={mark} className={`pageNumber${mark===paged.page?' active':''}`} aria-current={mark===paged.page?'page':undefined} aria-label={`第 ${mark} 頁`} onClick={()=>changePage(mark)}>{mark}</button>
        )}
        <button type="button" className="pageStep" disabled={paged.page===paged.totalPages} onClick={()=>changePage(paged.page+1)} aria-label="下一頁">下一頁 ›</button>
      </div>
    </nav>}
    </div><footer>Made with ♡ & tiny flowers · Pikmin Postcards</footer>
    {reportTarget&&<DuplicateReportPicker
      target={reportTarget}
      cards={records}
      selectedId={duplicateOfId}
      onSelect={setDuplicateOfId}
      onCancel={()=>{setReportTarget(null);setDuplicateOfId('')}}
      onConfirm={()=>void reportDuplicate()}
      busy={ownerBusy}
    />}
    {selected&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><section className="modal" role="dialog" aria-modal="true" aria-label="明信片詳情"><button className="close" onClick={()=>setSelected(null)} aria-label="關閉"><X size={20}/></button>{selected.imageUrl?<img src={imageUrl(selected)} alt="明信片圖片" className="modalImage"/>:<div className="modalImage placeholder">✉</div>}<h2>{selected.location.landmark||selected.location.city||selected.location.countryName||'我的明信片'}</h2><p>{countryAndDifference(selected)} · {displayLocation(selected)}</p><p>{sourceLabel(selected)}{selected.category&&` · ${selected.category}`}</p><p>上傳者：{selected.uploadedBy||'未知'}</p>{selected.externalSource&&<p>原始來源：<a href={selected.externalSource.site} target="_blank" rel="noopener noreferrer">皮克敏明信片座標分享站</a>{selected.externalSource.nameOnSource&&` · 原站名稱：${selected.externalSource.nameOnSource}`}</p>}<p className="coords">{selected.coordinates.lat}, {selected.coordinates.lng}</p><div className="actions"><button onClick={()=>navigator.clipboard.writeText(`${selected.coordinates.lat}, ${selected.coordinates.lng}`)}><Copy size={16}/> 複製座標</button><a target="_blank" rel="noopener noreferrer" href={mapUrl(selected)}><ExternalLink size={16}/> Google Maps</a></div></section></div>}
    {editingCard&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!ownerBusy)setEditingCard(null)}}><form className="modal editForm" aria-label="編輯明信片資料" onSubmit={event=>{event.preventDefault();void saveEdit()}}><h2>編輯明信片</h2><p>{sharedEditableIds.includes(editingCard.id)?'這張為共用明信片，持有有效邀請碼的人都可以修改或下架。':'只有上傳者可編輯這張明信片。'}</p><div className="editGrid"><fieldset className="editSources"><legend>來源（可複選）</legend>{availableSources.map(value=><label key={value}><input type="checkbox" checked={getSources(editingCard).includes(value)} onChange={e=>setEditingCard(previous=>{if(!previous)return previous;const values=getSources(previous);return {...previous,sources:e.target.checked?[...values,value]:values.filter(item=>item!==value)};})}/>{sourceNames[value]}</label>)}</fieldset><label>愛心<select value={editingCard.favorite===1?1:0} onChange={e=>setEditingCard(p=>p?{...p,favorite:Number(e.target.value) as 0|1}:p)}><option value={0}>♡ 無愛心</option><option value={1}>❤️ 喜愛</option></select></label><label>類別<select value={editingCard.category||''} onChange={e=>setEditingCard(p=>p?{...p,category:e.target.value}:p)}><option value="">保持未分類</option>{detailCategories.map(c=><option key={c} value={c}>{c}</option>)}</select></label><label>國家代碼（兩碼）<input required maxLength={2} value={editingCard.location.countryCode} onChange={e=>updateEditLocation('countryCode',e.target.value.toUpperCase())}/></label><label>國家名稱<input required maxLength={160} value={editingCard.location.countryName} onChange={e=>updateEditLocation('countryName',e.target.value)}/></label><label>城市<input maxLength={160} value={editingCard.location.city} onChange={e=>updateEditLocation('city',e.target.value)}/></label><label>行政區<input maxLength={160} value={editingCard.location.district} onChange={e=>updateEditLocation('district',e.target.value)}/></label><label className="editWide">地標<input maxLength={160} value={editingCard.location.landmark||''} onChange={e=>updateEditLocation('landmark',e.target.value)}/></label><label>緯度<input type="number" step="any" min="-90" max="90" required value={Number.isNaN(editingCard.coordinates.lat)?'':editingCard.coordinates.lat} onChange={e=>setEditingCard(p=>p?{...p,coordinates:{...p.coordinates,lat:e.target.value===''?NaN:Number(e.target.value)}}:p)}/></label><label>經度<input type="number" step="any" min="-180" max="180" required value={Number.isNaN(editingCard.coordinates.lng)?'':editingCard.coordinates.lng} onChange={e=>setEditingCard(p=>p?{...p,coordinates:{...p.coordinates,lng:e.target.value===''?NaN:Number(e.target.value)}}:p)}/></label></div><div className="editActions"><button type="button" disabled={ownerBusy} onClick={()=>setEditingCard(null)}>取消</button><button type="submit" disabled={ownerBusy}>{ownerBusy?'儲存中…':'儲存修改'}</button></div></form></div>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
