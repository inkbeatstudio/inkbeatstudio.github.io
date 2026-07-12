function initParticles(canvasId) {
  const canvas = document.getElementById(canvasId)
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const colors = ['#B8452C','#241F3D','#8D84C4']

  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
  resize()
  window.addEventListener('resize', resize)

  const particles = Array.from({length:80}, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    vx: (Math.random()-.5)*.3,
    vy: (Math.random()-.5)*.3,
    size: Math.random()*2+.5,
    opacity: Math.random()*.5+.1,
    color: colors[Math.floor(Math.random()*colors.length)]
  }))

  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height)
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy
      if (p.x<0) p.x=canvas.width
      if (p.x>canvas.width) p.x=0
      if (p.y<0) p.y=canvas.height
      if (p.y>canvas.height) p.y=0
      ctx.beginPath()
      ctx.arc(p.x,p.y,p.size,0,Math.PI*2)
      ctx.fillStyle = p.color + Math.round(p.opacity*255).toString(16).padStart(2,'0')
      ctx.fill()
    })
    for (let i=0;i<particles.length;i++) {
      for (let j=i+1;j<particles.length;j++) {
        const dx=particles[i].x-particles[j].x, dy=particles[i].y-particles[j].y
        const dist=Math.sqrt(dx*dx+dy*dy)
        if (dist<120) {
          ctx.beginPath()
          ctx.moveTo(particles[i].x,particles[i].y)
          ctx.lineTo(particles[j].x,particles[j].y)
          ctx.strokeStyle=`rgba(184,69,44,${(1-dist/120)*.08})`
          ctx.lineWidth=.5; ctx.stroke()
        }
      }
    }
    requestAnimationFrame(draw)
  }
  draw()
}
