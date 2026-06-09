import { useEffect, useRef } from 'react';

export default function TableWrap({ children, className = '', style = {} }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      if (!el) return;
      el.classList.toggle('is-overflowing', el.scrollWidth > el.clientWidth);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.addEventListener('scroll', check);
    return () => { ro.disconnect(); el.removeEventListener('scroll', check); };
  }, [children]);
  return <div ref={ref} className={`table-wrap ${className}`} style={style}>{children}</div>;
}