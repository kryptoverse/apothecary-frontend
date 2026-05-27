'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Hospital } from 'lucide-react';
import { Input, Button, Checkbox, FeatureList, StatsGrid } from '@/components/ui';
import { getDashboardPath, startPortalLogin, verifyAdminSigninOtp } from '@/lib/auth';

export default function Login() {
    const router = useRouter();
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        remember: false,
    });
    const [otp, setOtp] = useState('');
    const [requiresOtp, setRequiresOtp] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            if (requiresOtp) {
                const session = await verifyAdminSigninOtp(formData.email, otp);
                router.push(getDashboardPath(session));
                return;
            }

            const result = await startPortalLogin(formData.email, formData.password);
            if (result.requiresOtp) {
                setRequiresOtp(true);
                setStatusMessage(result.message || 'OTP sent to admin email.');
                return;
            }

            if (result.session) {
                router.push(getDashboardPath(result.session));
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to sign in.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setFormData({
            ...formData,
            [e.target.name]: value,
        });
    };

    const resetOtpStep = () => {
        setRequiresOtp(false);
        setOtp('');
        setStatusMessage('');
        setError('');
    };

    return (
        <div className="min-h-screen flex">
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
                            Welcome Back
                        </h2>
                        <p className="mt-2 text-gray-600">
                            Sign in to manage the Apothecary care portal
                        </p>
                    </div>

                    <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
                        {error && (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                {error}
                            </div>
                        )}

                        {statusMessage && (
                            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                                {statusMessage}
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
                            disabled={requiresOtp}
                        />

                        <Input
                            id="password"
                            name="password"
                            type="password"
                            label="Password"
                            required
                            value={formData.password}
                            onChange={handleChange}
                            placeholder="Password"
                            disabled={requiresOtp}
                        />

                        {requiresOtp && (
                            <Input
                                id="otp"
                                name="otp"
                                type="text"
                                inputMode="numeric"
                                label="Verification Code"
                                required
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                                placeholder="Enter 6-digit OTP"
                                maxLength={6}
                            />
                        )}

                        {!requiresOtp && (
                            <div className="flex items-center">
                                <Checkbox
                                    id="remember"
                                    name="remember"
                                    checked={formData.remember}
                                    onChange={handleChange}
                                    label="Remember me"
                                />
                            </div>
                        )}

                        <Button
                            type="submit"
                            isLoading={isLoading}
                            fullWidth
                            size="lg"
                        >
                            {requiresOtp ? 'Verify OTP' : 'Sign In'}
                        </Button>

                        {requiresOtp && (
                            <button
                                type="button"
                                onClick={resetOtpStep}
                                className="w-full text-sm font-medium text-primary hover:text-primary-dark"
                            >
                                Use a different email
                            </button>
                        )}

                    </form>

                    <div className="mt-4 p-4 bg-surface-container-low rounded-xl border border-outline-variant">
                        <div className="flex items-start space-x-3">
                            <svg className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                            <div>
                                <p className="text-sm font-semibold text-foreground mb-2">Secure Login</p>
                                <p className="text-xs text-gray-700">
                                    Patients, Admins and Assistants use the same sign-in. The portal opens the correct dashboard after authentication.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-primary to-secondary-dark relative overflow-hidden">
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute top-20 left-20 w-64 h-64 bg-primary rounded-full blur-3xl"></div>
                    <div className="absolute bottom-20 right-20 w-96 h-96 bg-primary rounded-full blur-3xl"></div>
                    <div className="absolute top-1/2 left-10 w-40 h-40 bg-white rounded-full blur-2xl"></div>
                </div>

                <div className="relative z-10 flex flex-col justify-evenly p-12 text-white w-full">
                    <div className="max-w-lg">
                        <h2 className="text-5xl font-bold mb-6 leading-tight">
                            Welcome Back to Your Wellness Journey
                        </h2>
                        <p className="text-xl text-gray-300 mb-8 leading-relaxed">
                            Continue your path to better mental health with professional support and guidance.
                        </p>

                        <FeatureList
                            features={[
                                { text: 'Secure & Private Sessions' },
                                { text: 'Access Anytime, Anywhere' },
                                { text: 'Personalized Care Plans' },
                            ]}
                        />
                    </div>

                    <StatsGrid
                        stats={[
                            { value: '10K+', label: 'Active Users' },
                            { value: '500+', label: 'Assistants' },
                            { value: '4.9/5', label: 'Rating' },
                        ]}
                    />
                </div>
            </div>
        </div>
    );
}
