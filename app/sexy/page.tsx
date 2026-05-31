import SexyCastleWatch from "./SexyCastleWatch";

const conceptCss = `
.sexy-page {
  background: radial-gradient(circle at 50% -12%, rgba(85,150,255,.28), transparent 34%), linear-gradient(180deg,#020814,#041326 50%,#01040a) !important;
}
.sexy-phone {
  width: min(720px, 100%) !important;
  background: radial-gradient(circle at 74% 26%, rgba(90,155,255,.30), transparent 25%), linear-gradient(180deg,rgba(4,14,30,.99),rgba(2,8,18,.99)) !important;
}
.sexy-topbar { margin-bottom: 20px !important; }
.sexy-topbar h1 { font-size: clamp(34px,8vw,48px) !important; letter-spacing: .085em !important; font-weight: 900 !important; }
.sexy-sparkle,.sexy-icon-button { border: 0 !important; background: transparent !important; }
.sexy-park-row { gap: 10px !important; margin-bottom: 24px !important; }
.sexy-park { min-height: 102px !important; border-radius: 19px !important; background: linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.025)) !important; }
.sexy-park svg { width: 39px !important; height: 39px !important; }
.sexy-park strong { font-size: 14px !important; line-height: 1.05 !important; }
.sexy-park.active { box-shadow: 0 0 0 1px rgba(142,197,255,.72),0 0 32px rgba(80,150,255,.34),inset 0 0 28px rgba(80,150,255,.2) !important; }
.sexy-hero { min-height: 158px !important; padding: 24px 4px 18px !important; border: 0 !important; border-radius: 0 !important; background: transparent !important; box-shadow: none !important; overflow: visible !important; }
.sexy-hero h2 { font-size: clamp(42px,10vw,64px) !important; letter-spacing: .01em !important; }
.sexy-hero p { font-size: 20px !important; color: #9ed0ff !important; }
.sexy-skyline { width: 220px !important; height: 160px !important; right: 8px !important; bottom: 4px !important; opacity: .98 !important; }
.sexy-stats { border-radius: 18px !important; background: rgba(10,27,51,.72) !important; }
.sexy-stats div { min-height: 104px !important; padding: 15px 14px !important; }
.sexy-stats span { font-size: 13px !important; }
.sexy-stats strong { font-size: 30px !important; }
.sexy-tabs { margin-top: 22px !important; border-radius: 18px !important; }
.sexy-tabs button { min-height: 66px !important; font-size: 22px !important; }
.sexy-ride { grid-template-columns: 82px 1fr 96px 18px !important; min-height: 88px !important; border-radius: 18px !important; }
.sexy-thumb { width: 72px !important; height: 72px !important; border-radius: 999px !important; }
.sexy-ride h3 { font-size: 24px !important; }
.sexy-ride p { font-size: 16px !important; }
.sexy-wait { min-width: 82px !important; font-size: 28px !important; border-radius: 18px !important; }
.sexy-map-card {
  min-height: 465px !important;
  border-radius: 0 !important;
  border: 0 !important;
  overflow: visible !important;
  margin: 4px -4px 8px !important;
  background:
    radial-gradient(circle at 50% 48%, rgba(255,223,160,.18), transparent 8%),
    radial-gradient(circle at 50% 50%, rgba(60,105,165,.32), transparent 34%),
    radial-gradient(circle at 50% 50%, rgba(3,12,25,.96), transparent 36%),
    repeating-radial-gradient(circle at 50% 50%, rgba(120,160,220,.13) 0 1px, transparent 1px 38px),
    linear-gradient(160deg, rgba(4,13,27,.98), rgba(1,6,14,.98)) !important;
  box-shadow: none !important;
}
.sexy-map-card::before {
  content: "";
  position: absolute;
  inset: 12% 7% 6%;
  border-radius: 44% 56% 49% 51% / 48% 44% 56% 52%;
  background:
    linear-gradient(90deg, transparent 49%, rgba(150,190,255,.10) 50%, transparent 51%),
    linear-gradient(0deg, transparent 49%, rgba(150,190,255,.08) 50%, transparent 51%),
    radial-gradient(circle at 50% 52%, rgba(220,240,255,.12), transparent 9%),
    radial-gradient(circle at 50% 52%, rgba(25,80,140,.16), transparent 46%);
  opacity: .72;
  filter: blur(.2px);
}
.sexy-map-card::after {
  content: "";
  position: absolute;
  left: 46%;
  top: 43%;
  width: 64px;
  height: 78px;
  background: linear-gradient(180deg, rgba(255,220,150,.88), rgba(75,125,190,.36) 55%, rgba(8,20,38,.72));
  clip-path: polygon(50% 0,58% 28%,72% 28%,76% 100%,24% 100%,28% 28%,42% 28%);
  filter: drop-shadow(0 0 18px rgba(120,180,255,.35));
  opacity: .82;
}
.map-zone {
  width: 178px !important;
  min-height: 138px !important;
  border-width: 2px !important;
  background: rgba(15,25,35,.52) !important;
  box-shadow: 0 0 34px rgba(255,255,255,.08), inset 0 0 24px rgba(255,255,255,.04) !important;
  z-index: 2 !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
}
.map-zone::before { display: block; margin: 0 0 10px; font-size: 30px; line-height: 1; filter: drop-shadow(0 0 12px currentColor); opacity: .95; }
.map-zone-0::before { content: "♞"; }
.map-zone-1::before { content: "↗"; }
.map-zone-2::before { content: "◠"; }
.map-zone-3::before { content: "▲"; }
.map-zone-4::before { content: "✣"; }
.map-zone h3 { font-size: 20px !important; margin: 0 0 10px !important; letter-spacing: .02em !important; text-align: center !important; }
.map-zone strong { display: none !important; }
.map-zone span { display:block !important; font-size: 15px !important; line-height: 1.35 !important; text-align:center !important; }
.map-zone small { display:block !important; font-size: 14px !important; padding: 5px 16px !important; margin-top: 10px !important; border-radius: 999px !important; text-align:center !important; text-transform: none !important; }
.map-zone-0 { left: 35% !important; top: 2% !important; border-radius: 41% 59% 48% 52% / 43% 46% 54% 57% !important; }
.map-zone-1 { right: 3% !important; top: 23% !important; border-radius: 51% 49% 44% 56% / 43% 38% 62% 57% !important; }
.map-zone-2 { left: 2% !important; top: 24% !important; border-radius: 58% 42% 54% 46% / 45% 57% 43% 55% !important; }
.map-zone-3 { left: 9% !important; bottom: 3% !important; border-radius: 45% 55% 42% 58% / 56% 41% 59% 44% !important; }
.map-zone-4 { right: 9% !important; bottom: 2% !important; border-radius: 58% 42% 56% 44% / 49% 54% 46% 51% !important; }
.sexy-zone.hot { border-color: rgba(255,105,118,.9) !important; background: rgba(110,30,45,.36) !important; color: #ffd4d8 !important; box-shadow: 0 0 34px rgba(255,90,110,.25), inset 0 0 26px rgba(255,90,110,.08) !important; }
.sexy-zone.warm { border-color: rgba(255,200,95,.86) !important; background: rgba(110,78,28,.34) !important; color: #ffe6a8 !important; box-shadow: 0 0 32px rgba(255,190,80,.22), inset 0 0 24px rgba(255,190,80,.08) !important; }
.sexy-zone.cool { border-color: rgba(75,220,180,.86) !important; background: rgba(24,100,88,.34) !important; color: #c9fff1 !important; box-shadow: 0 0 32px rgba(60,220,175,.20), inset 0 0 24px rgba(60,220,175,.08) !important; }
.hot-detail { grid-template-columns: 100px 1fr !important; padding: 20px !important; border-left-width: 8px !important; border-radius: 20px !important; }
.hot-detail .sexy-thumb { width: 88px !important; height: 88px !important; }
.hot-detail h3,.sexy-next-move h3,.sexy-transport-card h3 { font-size: 28px !important; }
.sexy-next-move { padding: 20px !important; border-radius: 20px !important; }
.sexy-plan-main { grid-template-columns: 96px 1fr 86px !important; }
.sexy-plan-main > strong { font-size: 30px !important; }
.sexy-mode-row button { min-height: 48px !important; font-size: 17px !important; }
.sexy-footer { min-height: 70px !important; padding: 16px 20px !important; border-radius: 18px !important; }
.sexy-footer strong { font-size: 20px !important; }
@media (max-width:430px){
  .sexy-park{min-height:82px!important}.sexy-park strong{font-size:10px!important}.sexy-hero{min-height:152px!important}.sexy-hero h2{font-size:40px!important}.sexy-stats strong{font-size:18px!important}.sexy-tabs button{min-height:56px!important;font-size:17px!important}.sexy-ride{grid-template-columns:64px 1fr 70px 10px!important;min-height:78px!important}.sexy-thumb{width:56px!important;height:56px!important}.sexy-ride h3{font-size:16px!important}.sexy-ride p{font-size:12px!important}.sexy-wait{min-width:58px!important;font-size:20px!important}.sexy-map-card{min-height:330px!important}.map-zone{width:122px!important;min-height:92px!important;padding:8px!important}.map-zone::before{font-size:20px!important;margin-bottom:4px!important}.map-zone h3{font-size:12px!important}.map-zone span{font-size:10px!important}.map-zone small{font-size:10px!important;padding:3px 10px!important}.hot-detail h3,.sexy-next-move h3,.sexy-transport-card h3{font-size:17px!important}
}
`;

export default function SexyPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: conceptCss }} />
      <SexyCastleWatch />
    </>
  );
}
