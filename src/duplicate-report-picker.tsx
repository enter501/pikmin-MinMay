import {useEffect, useMemo, useRef, useState} from 'react';
import {Search, X, Check, ZoomIn, ZoomOut} from 'lucide-react';
import {duplicateCandidates, duplicateCountryOptions, type DuplicateCandidate} from './duplicate-selection';
import {postcardImageUrl} from './postcard-image';
import './duplicate-picker.css';

type Candidate = DuplicateCandidate & {imageUrl:string;imageStorage?:string;createdAt:string};
type Props<T extends Candidate> = {
  target: T;
  cards: T[];
  selectedId: string;
  onSelect: (id:string)=>void;
  onCancel: ()=>void;
  onConfirm: ()=>void;
  busy: boolean;
};

const CHUNK = 24;
function imageUrl(card:Candidate):string {
  return postcardImageUrl(card,import.meta.env.BASE_URL);
}
function heading(card:Candidate):string {
  return card.location.landmark || card.location.city || card.location.countryName || '明信片';
}
function information(card:Candidate):string {
  return [card.location.countryName,card.location.city,card.location.district].filter(Boolean).join(' · ');
}

export function DuplicateReportPicker<T extends Candidate>({
  target,cards,selectedId,onSelect,onCancel,onConfirm,busy
}:Props<T>) {
  const [country,setCountry]=useState(target.location.countryName);
  const [search,setSearch]=useState('');
  const [limit,setLimit]=useState(CHUNK);
  const [expanded,setExpanded]=useState(false);
  const scrollBody=useRef<HTMLDivElement>(null);

  const countryOptions=useMemo(()=>duplicateCountryOptions(cards,target.id),[cards,target.id]);
  const candidates=useMemo(()=>duplicateCandidates(cards,target.id,country,search),[cards,target.id,country,search]);
  const selected=cards.find(card=>card.id===selectedId && card.id!==target.id);
  useEffect(()=>setLimit(CHUNK),[country,search]);
  useEffect(()=>{
    const onKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!busy)onCancel()};
    document.addEventListener('keydown',onKeyDown);
    return ()=>document.removeEventListener('keydown',onKeyDown);
  },[busy,onCancel]);

  return <div className="modalBackdrop duplicateBackdrop" onMouseDown={event=>{
    if(event.target===event.currentTarget&&!busy)onCancel();
  }}>
    <form className="duplicatePicker" role="dialog" aria-modal="true" aria-label="圖片比較與重複回報" onSubmit={event=>{event.preventDefault();if(selected&&!busy)onConfirm()}}>
      <header className="duplicatePickerHeader">
        <div><span className="duplicateStep">步驟 1／2 · 選擇相同圖片</span><h2>回報重複明信片</h2></div>
        <button type="button" aria-label="關閉重複回報" className="duplicateClose" onClick={onCancel} disabled={busy}><X size={21}/></button>
      </header>

      <div className="duplicatePickerBody" ref={scrollBody}>
        <section aria-label="兩張明信片比較">
          <div className="duplicateCompareLabels"><strong>左圖：準備回報下架</strong><strong>右圖：比對參考（不下架）</strong></div>
          <div className={`duplicateComparison${expanded?' expanded':''}`}>
            <figure>
              <img src={imageUrl(target)} alt={`準備回報的明信片：${heading(target)}`} />
              <figcaption>{heading(target)}<small>{information(target)}</small></figcaption>
            </figure>
            <figure>
              {selected?<img src={imageUrl(selected)} alt={`用來比較的明信片：${heading(selected)}`}/>:<div className="duplicatePicturePlaceholder">從下方點選另一張圖片</div>}
              <figcaption>{selected?heading(selected):'尚未選擇'}<small>{selected?information(selected):'可跨國家搜尋'}</small></figcaption>
            </figure>
          </div>
          <button className="duplicateZoom" type="button" onClick={()=>setExpanded(v=>!v)}>
            {expanded?<ZoomOut size={15}/>:<ZoomIn size={15}/>}
            {expanded?'縮小並排圖片':'放大比較圖片'}
          </button>
        </section>

        <section className="duplicateSearchSection" aria-label="尋找重複的明信片">
          <div className="duplicateStep">步驟 2／2 · 找出另一張相同明信片</div>
          <div className="duplicateFilters">
            <label className="duplicateSearchBox"><Search size={18}/>
              <input value={search} onChange={event=>setSearch(event.target.value)}
                placeholder="搜尋城市、地標、國家、上傳者…" aria-label="搜尋另一張明信片"/>
            </label>
            <label className="duplicateCountrySelect">
              <span>國家</span>
              <select value={country} onChange={event=>setCountry(event.target.value)} aria-label="依國家篩選可比較的明信片">
                {countryOptions.map(c=><option key={c.value} value={c.value}>{c.value}（{c.count} 張）</option>)}
              </select>
            </label>
          </div>
          <p className="duplicateCount" role="status">符合條件 {candidates.length} 張 · 優先顯示座標接近的圖片{country!=='全部國家'&&' · 跨國比對可選「全部國家」'}</p>
          <div className="duplicateThumbGrid">
            {candidates.slice(0,limit).map(card=><button type="button" key={card.id}
              className={`duplicateThumb${selectedId===card.id?' chosen':''}`}
              aria-pressed={selectedId===card.id}
              aria-label={`選擇${information(card)}、${heading(card)}，${card.uploadedBy||'未知上傳者'}的明信片`}
              onClick={()=>{onSelect(card.id);setExpanded(false);scrollBody.current?.scrollTo({top:0,behavior:'smooth'})}}
            >
              <span className="duplicateThumbImage"><img src={imageUrl(card)} alt="" loading="lazy"/>{selectedId===card.id&&<span className="duplicateSelectedIcon"><Check size={18}/></span>}</span>
              <span className="duplicateThumbText"><strong>{heading(card)}</strong><small>{information(card)}</small></span>
            </button>)}
          </div>
          {candidates.length===0&&<p className="duplicateEmpty">找不到符合條件的明信片，試試「全部國家」或其他關鍵字。</p>}
          {candidates.length>limit&&<button type="button" className="duplicateMore" onClick={()=>setLimit(n=>n+CHUNK)}>
            顯示更多圖片（目前 {Math.min(limit,candidates.length)}／{candidates.length} 張）
          </button>}
        </section>
        <p className="duplicatePolicy">回報超過 7 天後由系統每 3 天檢查；下架前任何有效邀請碼使用者都可以取消。下架後圖片仍保留 30 天供管理員復原。</p>
      </div>

      <footer className="duplicatePickerFooter">
        <span>{selected?'請確認左圖與右圖相同，回報對象是左圖':'請先選擇另一張相同明信片'}</span>
        <div><button type="button" onClick={onCancel} disabled={busy}>取消</button><button type="submit" disabled={!selected||busy}>{busy?'提交中…':'確認回報左圖'}</button></div>
      </footer>
    </form>
  </div>;
}
