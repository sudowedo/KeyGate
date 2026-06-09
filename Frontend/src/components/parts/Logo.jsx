/* ── KeyGate Logo ── */
/* A stylized key + gate/shield symbol */

export function LogoIcon({ size = 28, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox='0 0 28 28'
      fill='none'
      className={className}
      xmlns='http://www.w3.org/2000/svg'
    >
      {/* Shield/gate outline */}
      <path
        d='M14 2L4 6.5v6c0 6.5 4 12 10 13.5 6-1.5 10-7 10-13.5v-6L14 2Z'
        fill='url(#logo-grad)'
        stroke='url(#logo-stroke)'
        strokeWidth='1.2'
      />
      {/* Key hole */}
      <circle cx='14' cy='12' r='3.5' fill='white' opacity='0.25' />
      <rect x='13' y='13.5' width='2' height='5' rx='0.8' fill='white' opacity='0.25' />
      {/* Key inside */}
      <path
        d='M14 9.5a2.5 2.5 0 1 0 1 4.8V18l1.5 1.5L18 18l-1.5-1.5'
        stroke='white'
        strokeWidth='1.2'
        strokeLinecap='round'
        strokeLinejoin='round'
        opacity='0.7'
      />
      <defs>
        <linearGradient id='logo-grad' x1='4' y1='2' x2='24' y2='28' gradientUnits='userSpaceOnUse'>
          <stop stopColor='#7c6bff' />
          <stop offset='1' stopColor='#a594ff' />
        </linearGradient>
        <linearGradient id='logo-stroke' x1='4' y1='2' x2='24' y2='28' gradientUnits='userSpaceOnUse'>
          <stop stopColor='#9a8fff' />
          <stop offset='1' stopColor='#b8aaff' />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function LogoFull({ size = 28, showSub = true }) {
  return (
    <div className='logo-mark'>
      <div className='logo-icon'>
        <LogoIcon size={22} />
      </div>
      <div>
        <div className='logo-name'>KeyGate</div>
        {showSub && <div className='logo-sub'>API access manager</div>}
      </div>
    </div>
  );
}