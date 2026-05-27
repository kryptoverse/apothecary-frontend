'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Hospital } from 'lucide-react';
import { Input, Button, Checkbox, FeatureList, StatsGrid } from '@/components/ui';
import { apiRequest } from '@/lib/api';

export default function Signup() {
    const router = useRouter();
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        confirmPassword: '',
        illness_description: '',
        terms: false,
    });
    const [isLoading, setIsLoading] = useState(false);
    const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [showOtp, setShowOtp] = useState(false);
    const [otp, setOtp] = useState('');
    const [userId, setUserId] = useState('');

    const getPasswordError = (password: string) => {
        if (password.length < 8) return 'Password must be at least 8 characters.';
        if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
        if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter.';
        if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
        if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one special character.';
        return null;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setNotice(null);

        const passwordError = getPasswordError(formData.password);
        if (passwordError) {
            setNotice({ type: 'error', message: passwordError });
            return;
        }

        if (formData.password !== formData.confirmPassword) {
            setNotice({ type: 'error', message: 'Passwords do not match.' });
            return;
        }

        if (!formData.terms) {
            setNotice({ type: 'error', message: 'Please accept the terms and conditions.' });
            return;
        }

        setIsLoading(true);

        try {
            const response = await apiRequest<{user_id: string, requires_verification: boolean}>('/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    email: formData.email.trim().toLowerCase(),
                    password: formData.password,
                    role: 'patient',
                    ...(formData.illness_description.trim() ? { illness_description: formData.illness_description.trim() } : {}),
                }),
            });

            if (response.data?.requires_verification) {
                setUserId(response.data.user_id);
                setShowOtp(true);
                setNotice({
                    type: 'success',
                    message: 'Account created successfully. Please enter the OTP sent to your email.',
                });
            } else {
                setNotice({
                    type: 'success',
                    message: 'Account created successfully. We will take you back to the home page.',
                });
                setTimeout(() => router.push('/'), 1400);
            }
        } catch (error) {
            setNotice({
                type: 'error',
                message: error instanceof Error ? error.message : 'Unable to create account.',
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleOtpSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setNotice(null);
        setIsLoading(true);

        try {
            await apiRequest('/auth/verify-email', {
                method: 'POST',
                body: JSON.stringify({
                    user_id: userId,
                    otp: otp.trim(),
                }),
            });

            setNotice({
                type: 'success',
                message: 'Email verified successfully! Redirecting to login...',
            });
            setTimeout(() => router.push('/auth/login'), 1400);
        } catch (error) {
            setNotice({
                type: 'error',
                message: error instanceof Error ? error.message : 'Unable to verify email.',
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
        setFormData({
            ...formData,
            [e.target.name]: value,
        });
    };

    return (
        <div className="min-h-screen flex">
            {/* Left Side - Branding */}
            <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-primary to-secondary-dark relative overflow-hidden">
                {/* Background Pattern */}
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute top-20 left-20 w-64 h-64 bg-primary rounded-full blur-3xl"></div>
                    <div className="absolute bottom-20 right-20 w-96 h-96 bg-primary rounded-full blur-3xl"></div>
                    <div className="absolute top-1/2 left-10 w-40 h-40 bg-white rounded-full blur-2xl"></div>
                </div>

                <div className="relative z-10 flex flex-col justify-evenly p-12 text-white w-full">
                    {/* Main Content */}
                    <div className="max-w-lg">
                        <h2 className="text-5xl font-bold mb-6 leading-tight">
                            Begin Your Journey to Clinic
                        </h2>
                        <p className="text-xl text-gray-300 mb-8 leading-relaxed">
                            Join thousands of individuals who have transformed their lives through professional mental health support.
                        </p>

                        {/* Features */}
                        <FeatureList
                            features={[
                                { text: 'Licensed & Certified Assistants' },
                                { text: '100% Confidential & Secure' },
                                { text: 'Flexible Scheduling 24/7' },
                            ]}
                        />
                    </div>

                    {/* Stats */}
                    <StatsGrid
                        stats={[
                            { value: '10K+', label: 'Active Users' },
                            { value: '500+', label: 'Assistants' },
                            { value: '4.9/5', label: 'Rating' },
                        ]}
                    />
                </div>
            </div>

            {/* Right Side - Form */}
            <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 bg-white">
                <div className="max-w-md w-full">
                    <Link href="/" className="flex justify-center mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-primary-container rounded-xl flex items-center justify-center shadow-sm">
                                <Hospital className="w-7 h-7 text-white" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold text-primary tracking-tight">Apothecary</h1>
                            </div>
                        </div>
                    </Link>

                    <div>
                        <h2 className="text-3xl font-bold text-foreground">
                            {showOtp ? 'Verify Your Email' : 'Create Your Account'}
                        </h2>
                        <p className="mt-2 text-gray-600">
                            {showOtp ? 'Enter the code sent to your email' : 'Patient registration only'}
                        </p>
                    </div>

                    {!showOtp ? (
                        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
                            {notice && (
                                <div
                                    className={`rounded-lg border px-4 py-3 text-sm ${notice.type === 'success'
                                        ? 'border-green-200 bg-green-50 text-green-700'
                                        : 'border-red-200 bg-red-50 text-red-700'
                                        }`}
                                >
                                    {notice.message}
                                </div>
                            )}

                            <Input
                                id="email"
                                name="email"
                                type="email"
                                label="Email Address"
                                required
                                value={formData.email}
                                onChange={handleChange}
                                placeholder="you@example.com"
                            />

                            <Input
                                id="password"
                                name="password"
                                type="password"
                                label="Password"
                                required
                                value={formData.password}
                                onChange={handleChange}
                                placeholder="••••••••"
                            />

                            <Input
                                id="confirmPassword"
                                name="confirmPassword"
                                type="password"
                                label="Confirm Password"
                                required
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                placeholder="••••••••"
                            />

                            <div className="flex flex-col gap-2">
                                <label htmlFor="illness_description" className="text-sm font-medium text-gray-700">What do you need help with?</label>
                                <textarea
                                    id="illness_description"
                                    name="illness_description"
                                    rows={4}
                                    value={formData.illness_description}
                                    onChange={handleChange}
                                    placeholder="Briefly describe your illness, symptoms, or reason for treatment."
                                    className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-transparent focus:ring-2 focus:ring-primary"
                                />
                            </div>

                            <Checkbox
                                id="terms"
                                name="terms"
                                checked={formData.terms}
                                onChange={handleChange}
                                label={
                                    <>
                                        I agree to the{' '}
                                        <a href="#" className="text-primary hover:text-primary-dark font-medium">
                                            Terms of Service
                                        </a>{' '}
                                        and{' '}
                                        <a href="#" className="text-primary hover:text-primary-dark font-medium">
                                            Privacy Policy
                                        </a>
                                    </>
                                }
                            />

                            <Button type="submit" fullWidth size="lg" isLoading={isLoading}>
                                {isLoading ? 'Creating account...' : 'Create Patient Account'}
                            </Button>

                            <p className="text-center text-sm text-gray-600 mb-4">
                                Already have an account?{' '}
                                <Link href="/auth/login" className="text-primary hover:text-primary-dark font-semibold">
                                    Sign in
                                </Link>
                            </p>
                        </form>
                    ) : (
                        <form className="mt-8 space-y-4" onSubmit={handleOtpSubmit}>
                            {notice && (
                                <div
                                    className={`rounded-lg border px-4 py-3 text-sm ${notice.type === 'success'
                                        ? 'border-green-200 bg-green-50 text-green-700'
                                        : 'border-red-200 bg-red-50 text-red-700'
                                        }`}
                                >
                                    {notice.message}
                                </div>
                            )}

                            <Input
                                id="otp"
                                name="otp"
                                type="text"
                                label="Verification Code (OTP)"
                                required
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                                placeholder="Enter 6-digit code"
                            />

                            <Button type="submit" fullWidth size="lg" isLoading={isLoading}>
                                {isLoading ? 'Verifying...' : 'Verify Email'}
                            </Button>

                            <p className="text-center text-sm text-gray-600 mb-4">
                                Didn't receive the code?{' '}
                                <button 
                                    type="button"
                                    onClick={() => {
                                        setNotice({ type: 'success', message: 'If you didn\'t receive the code, please check your spam folder.' });
                                    }}
                                    className="text-primary hover:text-primary-dark font-semibold"
                                >
                                    Resend
                                </button>
                            </p>
                            
                            <p className="text-center text-sm">
                                <button 
                                    type="button"
                                    onClick={() => setShowOtp(false)}
                                    className="text-gray-600 hover:text-foreground font-medium"
                                >
                                    ← Back to Signup
                                </button>
                            </p>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
