export default function Bg() {
  return (
    <div className="cosmos fixed inset-0 -z-50">
      {/* <div className="aurora" /> */}
      <div className="tech-grid" />

      {/* Optimized gradient blobs - reduced blur for better performance */}
      <div style={{position:'absolute',inset:0,pointerEvents:'none'}}>
        <div style={{position:'absolute',width:420,height:420,left:'-8%',top:'-6%',filter:'blur(40px)',opacity:.25,background:'radial-gradient(circle,#00d9ff 0%, rgba(0,217,255,0) 60%)'}} />
        <div style={{position:'absolute',width:520,height:520,right:'-12%',top:'-10%',filter:'blur(50px)',opacity:.22,background:'radial-gradient(circle,#bd00ff 0%, rgba(189,0,255,0) 60%)'}} />
        <div style={{position:'absolute',width:380,height:380,left:'10%',bottom:'-10%',filter:'blur(45px)',opacity:.20,background:'radial-gradient(circle,#ff006e 0%, rgba(255,0,110,0) 60%)'}} />
      </div>

      {/* Static decorative dots - no animation for better performance */}
      <div className="static-dot" style={{ width: 12, height: 12, left: '15%', top: '28%', background: 'radial-gradient(circle, rgba(0,212,255,0.6), rgba(0,212,255,0.0) 60%)', position: 'absolute', borderRadius: '50%', opacity: 0.7 }} />
      <div className="static-dot" style={{ width: 10, height: 10, left: '72%', top: '22%', background: 'radial-gradient(circle, rgba(139,92,246,0.6), rgba(139,92,246,0.0) 60%)', position: 'absolute', borderRadius: '50%', opacity: 0.7 }} />
      <div className="static-dot" style={{ width: 14, height: 14, left: '60%', top: '68%', background: 'radial-gradient(circle, rgba(236,72,153,0.6), rgba(236,72,153,0.0) 60%)', position: 'absolute', borderRadius: '50%', opacity: 0.7 }} />
      <div className="static-dot" style={{ width: 8, height: 8, left: '34%', top: '62%', background: 'radial-gradient(circle, rgba(6,255,165,0.6), rgba(6,255,165,0.0) 60%)', position: 'absolute', borderRadius: '50%', opacity: 0.7 }} />
      <div className="static-dot" style={{ width: 11, height: 11, left: '85%', top: '48%', background: 'radial-gradient(circle, rgba(59,130,246,0.6), rgba(59,130,246,0.0) 60%)', position: 'absolute', borderRadius: '50%', opacity: 0.7 }} />
      <div className="static-dot" style={{ width: 9, height: 9, left: '8%', top: '70%', background: 'radial-gradient(circle, rgba(255,183,0,0.6), rgba(255,183,0,0.0) 60%)', position: 'absolute', borderRadius: '50%', opacity: 0.7 }} />
    </div>
  );
}
