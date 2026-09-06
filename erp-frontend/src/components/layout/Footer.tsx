import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';

const Footer: React.FC = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-gray-200 bg-white px-6 py-3">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 text-sm text-gray-500 sm:flex-row">
        <span>&copy; {year} Phoenix ERP</span>
        <Link
          to="/manual"
          className="flex items-center gap-1.5 font-medium text-gray-600 transition-colors hover:text-blue-600"
        >
          <BookOpen size={14} />
          User Manual
        </Link>
      </div>
    </footer>
  );
};

export default Footer;
