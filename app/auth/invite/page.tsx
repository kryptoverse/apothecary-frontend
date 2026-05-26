'use client';

import { Suspense, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Input } from '@/components/ui';
import { apiRequest } from '@/lib/api';

type InviteDetails = {
    email: string;
    doctor_id?: string;
    message: string;
};

function getPasswordError(password: string) {
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
    if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter.';
    if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
    if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one special character.';
    return null;
}

function InviteContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token') || '';
    const [invite, setInvite] = useState<InviteDetails | null>(null);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    useEffect(() => {
        const validateInvite = async () => {
            if (!token) {
                setNotice({ type: 'error', message: 'Invite token is missing.' });
                setIsLoading(false);
                return;
            }

            try {
                const response = await apiRequest<InviteDetails>('/auth/invite/validate', {
                    method: 'POST',
                    body: JSON.stringify({ token }),
                });
                setInvite(response.data || null);
            } catch (error) {
                setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Invalid or expired invite link.' });
            } finally {
                setIsLoading(false);
            }
        };

        void validateInvite();
    }, [token]);

    const completeInvite = async (event: React.FormEvent) => {
        event.preventDefault();
        setNotice(null);

        const passwordError = getPasswordError(password);
        if (passwordError) {
            setNotice({ type: 'error', message: passwordError });
            return;
        }

        if (password !== confirmPassword) {
            setNotice({ type: 'error', message: 'Passwords do not match.' });
            return;
        }

        setIsSubmitting(true);

        try {
            const response = await apiRequest<{ requires_verification?: boolean }>('/auth/invite/complete', {
                method: 'POST',
                body: JSON.stringify({ token, password }),
            });

            setNotice({
                type: 'success',
                message: response.data?.requires_verification
                    ? 'Account created. Please check your email for the verification code, then sign in.'
                    : 'Invite accepted. Redirecting to login...',
            });
            setTimeout(() => router.push('/auth/login'), 1600);
        } catch (error) {
            setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Unable to complete invite.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 px-4 py-10">
            <div className="mx-auto max-w-md rounded-2xl bg-white p-8 shadow-sm">
                <Link href="/" className="mb-8 flex justify-center">
                    <Image src="/logo.webp" height={80} width={280} alt="Apothecary Logo" priority />
                </Link>

                <h1 className="text-2xl font-bold text-[#4a3428]">Accept Doctor Invite</h1>
                <p className="mt-2 text-sm text-gray-600">Create your patient account using the email your Doctor invited.</p>

                {notice && (
                    <div className={`mt-6 rounded-lg border px-4 py-3 text-sm ${notice.type === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                        {notice.message}
                    </div>
                )}

                {isLoading && (
                    <div className="mt-8 rounded-lg bg-gray-50 p-5 text-center text-sm text-gray-500">
                        Validating invite...
                    </div>
                )}

                {!isLoading && invite && (
                    <>
                        <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Invited email</p>
                            <p className="mt-1 font-semibold text-[#4a3428]">{invite.email}</p>
                        </div>

                        <form onSubmit={completeInvite} className="mt-6 space-y-4">
                            <Input
                                id="password"
                                name="password"
                                type="password"
                                label="Create Password"
                                required
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                placeholder="••••••••"
                            />

                            <Input
                                id="confirmPassword"
                                name="confirmPassword"
                                type="password"
                                label="Confirm Password"
                                required
                                value={confirmPassword}
                                onChange={(event) => setConfirmPassword(event.target.value)}
                                placeholder="••••••••"
                            />

                            <Button type="submit" fullWidth size="lg" isLoading={isSubmitting}>
                                Accept Invite
                            </Button>
                        </form>

                        <div className="mt-6 rounded-lg bg-[#fef3e8] px-4 py-3 text-sm text-gray-700">
                            Already have a patient account with this email? Sign in, then open your patient invite list to accept the pending Doctor invite.
                        </div>
                    </>
                )}

                {!isLoading && !invite && (
                    <div className="mt-6 space-y-4">
                        <Button type="button" fullWidth onClick={() => router.push('/auth/login')}>
                            Go to Login
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function InvitePage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
            <InviteContent />
        </Suspense>
    );
}
