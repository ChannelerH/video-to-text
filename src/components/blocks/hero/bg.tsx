export default function Bg() {
  return (
    <div className="cosmos fixed inset-0 -z-50">
      {/* <div className="aurora" /> */}
      <div className="tech-grid" />

      {/* Mesh gradient blobs for depth */}
      <div style={{position:'absolute',inset:0,pointerEvents:'none'}}>
        <div style={{position:'absolute',width:420,height:420,left:'-8%',top:'-6%',filter:'blur(80px)',opacity:.35,background:'radial-gradient(circle,#00d9ff 0%, rgba(0,217,255,0) 60%)'}} />
        <div style={{position:'absolute',width:520,height:520,right:'-12%',top:'-10%',filter:'blur(100px)',opacity:.32,background:'radial-gradient(circle,#bd00ff 0%, rgba(189,0,255,0) 60%)'}} />
        <div style={{position:'absolute',width:380,height:380,left:'10%',bottom:'-10%',filter:'blur(90px)',opacity:.28,background:'radial-gradient(circle,#ff006e 0%, rgba(255,0,110,0) 60%)'}} />
      </div>

      {/* Floating decorative dots */}
      <div className="float-dot" style={{ width: 12, height: 12, left: '15%', top: '28%', background: 'radial-gradient(circle, rgba(0,212,255,0.9), rgba(0,212,255,0.0) 60%)' }} />
      <div className="float-dot" style={{ width: 10, height: 10, left: '72%', top: '22%', animationDelay: '0.6s', background: 'radial-gradient(circle, rgba(139,92,246,0.9), rgba(139,92,246,0.0) 60%)' }} />
      <div className="float-dot" style={{ width: 14, height: 14, left: '60%', top: '68%', animationDelay: '1.1s', background: 'radial-gradient(circle, rgba(236,72,153,0.9), rgba(236,72,153,0.0) 60%)' }} />
      <div className="float-dot" style={{ width: 8, height: 8, left: '34%', top: '62%', animationDelay: '1.7s', background: 'radial-gradient(circle, rgba(6,255,165,0.9), rgba(6,255,165,0.0) 60%)' }} />
      <div className="float-dot" style={{ width: 11, height: 11, left: '85%', top: '48%', animationDelay: '2.2s', background: 'radial-gradient(circle, rgba(59,130,246,0.9), rgba(59,130,246,0.0) 60%)' }} />
      <div className="float-dot" style={{ width: 9, height: 9, left: '8%', top: '70%', animationDelay: '2.8s', background: 'radial-gradient(circle, rgba(255,183,0,0.9), rgba(255,183,0,0.0) 60%)' }} />
    </div>
  );
}
