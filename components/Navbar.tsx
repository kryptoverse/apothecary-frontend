'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function Navbar() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    return (
        <nav className="bg-white shadow-sm sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    {/* Logo */}
                    <Link href="/" className="flex items-center space-x-2">
                        <div className="text-2xl font-bold">
                            <span className="text-[var(--on-surface)]">Apo</span><span className="text-[var(--primary)]">thecary</span>
                        </div>
                    </Link>

                    {/* Desktop Navigation */}
                    <div className="hidden md:flex items-center space-x-8">
                        <Link href="/" className="text-gray-700 hover:text-primary transition-colors">
                            Home
                        </Link>
                        <Link href="/about" className="text-gray-700 hover:text-primary transition-colors">
                            About
                        </Link>
                        <Link href="/pricing" className="text-gray-700 hover:text-primary transition-colors">
                            Pricing
                        </Link>
                        <Link href="/contact" className="text-gray-700 hover:text-primary transition-colors">
                            Contact
                        </Link>
                        <Link
                            href="/auth/login"
                            className="text-primary hover:text-primary-dark font-medium transition-colors"
                        >
                            Login
                        </Link>
                        <Link
                            href="/auth/signup"
                            className="bg-primary text-white px-6 py-2 rounded-full hover:bg-primary-dark transition-colors"
                        >
                            Sign Up
                        </Link>
                    </div>

                    {/* Mobile menu button */}
                    <button
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className="md:hidden p-2 rounded-md text-gray-700 hover:text-primary"
                    >
                        <svg
                            className="h-6 w-6"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            {isMenuOpen ? (
                                <path d="M6 18L18 6M6 6l12 12" />
                            ) : (
                                <path d="M4 6h16M4 12h16M4 18h16" />
                            )}
                        </svg>
                    </button>
                </div>

                {/* Mobile Navigation */}
                {isMenuOpen && (
                    <div className="md:hidden pb-4 space-y-2">
                        <Link
                            href="/"
                            className="block px-4 py-2 text-gray-700 hover:bg-accent rounded-md"
                            onClick={() => setIsMenuOpen(false)}
                        >
                            Home
                        </Link>
                        <Link
                            href="/about"
                            className="block px-4 py-2 text-gray-700 hover:bg-accent rounded-md"
                            onClick={() => setIsMenuOpen(false)}
                        >
                            About
                        </Link>
                        <Link
                            href="/pricing"
                            className="block px-4 py-2 text-gray-700 hover:bg-accent rounded-md"
                            onClick={() => setIsMenuOpen(false)}
                        >
                            Pricing
                        </Link>
                        <Link
                            href="/contact"
                            className="block px-4 py-2 text-gray-700 hover:bg-accent rounded-md"
                            onClick={() => setIsMenuOpen(false)}
                        >
                            Contact
                        </Link>
                        <Link
                            href="/auth/login"
                            className="block px-4 py-2 text-primary font-medium hover:bg-accent rounded-md"
                            onClick={() => setIsMenuOpen(false)}
                        >
                            Login
                        </Link>
                        <Link
                            href="/auth/signup"
                            className="block px-4 py-2 bg-primary text-white text-center rounded-full hover:bg-primary-dark"
                            onClick={() => setIsMenuOpen(false)}
                        >
                            Sign Up
                        </Link>
                    </div>
                )}
            </div>
        </nav>
    );
}
