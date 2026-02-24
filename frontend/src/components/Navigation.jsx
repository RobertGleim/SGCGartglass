import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function Navigation() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navLinks = [
    { to: '/designer', label: 'Designer' },
    { to: '/my-projects', label: 'My Projects' },
    { to: '/my-work-orders', label: 'My Work Orders' },
    { to: '/admin/templates', label: 'Admin Templates' },
    { to: '/admin/glass-types', label: 'Glass Types' },
    { to: '/admin/work-orders', label: 'Work Orders' },
  ];
  return (
    <nav>
      <div className="nav-inner">
        <button className="hamburger" onClick={() => setOpen((v) => !v)} aria-label="Toggle navigation">
          ☰
        </button>
        <ul className={`nav-links${open ? ' open' : ''}`}>
          {navLinks.map((link) => (
            <li key={link.to} className={location.pathname === link.to ? 'active' : ''}>
              <Link to={link.to} onClick={() => setOpen(false)}>{link.label}</Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
