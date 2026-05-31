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
.sexy-map-card { min-height: 465px !important; border-radius: 28px !important; }
.map-zone { width: 160px !important; min-height: 136px !important; border-width: 2px !important; }
.map-zone h3 { font-size: 18px !important; }
.map-zone span { font-size: 13px !important; }
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
  .sexy-park{min-height:82px!important}.sexy-park strong{font-size:10px!important}.sexy-hero{min-height:152px!important}.sexy-hero h2{font-size:40px!important}.sexy-stats strong{font-size:18px!important}.sexy-tabs button{min-height:56px!important;font-size:17px!important}.sexy-ride{grid-template-columns:64px 1fr 70px 10px!important;min-height:78px!important}.sexy-thumb{width:56px!important;height:56px!important}.sexy-ride h3{font-size:16px!important}.sexy-ride p{font-size:12px!important}.sexy-wait{min-width:58px!important;font-size:20px!important}.sexy-map-card{min-height:350px!important}.map-zone{width:124px!important;min-height:96px!important}.map-zone h3{font-size:12px!important}.hot-detail h3,.sexy-next-move h3,.sexy-transport-card h3{font-size:17px!important}
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
