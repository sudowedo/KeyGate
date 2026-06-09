export default function NotFoundView({ go, page, navigate }) {
  return (
    <div className='page active not-found-page'>
      <div className='not-found-content'>
        <div className='not-found-icon'>
          <svg width="80" height="80" viewBox="0 0 28 28" fill="none">
            <path d="M14 2L4 6.5v6c0 6.5 4 12 10 13.5 6-1.5 10-7 10-13.5v-6L14 2Z" fill="url(#nf-grad)" opacity=".3" />
            <path d="M14 2L4 6.5v6c0 6.5 4 12 10 13.5 6-1.5 10-7 10-13.5v-6L14 2Z" stroke="url(#nf-grad)" strokeWidth="1" strokeDasharray="3 3" opacity=".5" />
            <defs>
              <linearGradient id="nf-grad" x1="4" y1="2" x2="24" y2="28">
                <stop stopColor="#7c6bff" />
                <stop offset="1" stopColor="#a594ff" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <h1 className='not-found-title'>404 — Page not found</h1>
        <p className='not-found-sub'>"{page}" doesn't exist in this console.</p>
        <div className='not-found-actions'>
          <button className='btn btn-primary' onClick={() => navigate('overview')}>Go to Overview</button>
          <button className='btn btn-ghost' onClick={() => go('/console')}>All projects</button>
        </div>
      </div>
    </div>
  );
}