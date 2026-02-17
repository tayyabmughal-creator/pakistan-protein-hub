import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { toast } from 'sonner';
import { Zap, Loader2 } from 'lucide-react';

const formSchema = z.object({
    email: z.string().email('Please enter a valid email address'),
});

const ForgotPassword = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: '',
        },
    });

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        setIsLoading(true);
        try {
            await axios.post('http://localhost:8000/api/users/password-reset', values);
            setIsSubmitted(true);
            toast.success('Reset link sent!');
        } catch (error: any) {
            console.error(error);
            const msg = error.response?.data?.detail || 'Something went wrong. Please try again.';
            toast.error(msg);
        } finally {
            setIsLoading(false);
        }
    };

    if (isSubmitted) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#050505] relative overflow-hidden px-4">
                {/* Background Effects */}
                <div className="absolute inset-0 z-0">
                    <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[120px]" />
                    <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[100px]" />
                </div>

                <Card className="w-full max-w-md bg-[#111] border-white/10 relative z-10 animate-fade-in">
                    <CardHeader className="space-y-4 text-center">
                        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-2 text-primary">
                            <Zap className="w-6 h-6 fill-primary" />
                        </div>
                        <CardTitle className="text-3xl font-heading font-bold text-white">Check your email</CardTitle>
                        <CardDescription className="text-gray-400 text-base">
                            We have sent a password reset link to your email address.
                        </CardDescription>
                    </CardHeader>
                    <CardFooter className="flex justify-center border-t border-white/5 pt-6">
                        <Button variant="link" asChild className="text-gray-400 hover:text-white">
                            <Link to="/login">Back to Login</Link>
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#050505] relative overflow-hidden px-4">
            {/* Background Effects */}
            <div className="absolute inset-0 z-0">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[100px]" />
            </div>

            <Card className="w-full max-w-md bg-[#111] border-white/10 relative z-10 animate-fade-in">
                <CardHeader className="space-y-4 text-center">
                    <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-2 text-primary">
                        <Zap className="w-6 h-6 fill-primary" />
                    </div>
                    <CardTitle className="text-3xl font-heading font-bold text-white">Forgot Password</CardTitle>
                    <CardDescription className="text-gray-400 text-base">
                        Enter your email address and we'll send you a link to reset your password.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-gray-300">Email</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="name@example.com"
                                                {...field}
                                                className="bg-black/20 border-white/10 focus:border-primary text-white h-12"
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Button
                                type="submit"
                                className="w-full h-12 font-bold text-lg bg-primary text-black hover:bg-white transition-all shadow-glow"
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                        Sending...
                                    </>
                                ) : 'Send Reset Link'}
                            </Button>
                        </form>
                    </Form>
                </CardContent>
                <CardFooter className="flex justify-center border-t border-white/5 pt-6">
                    <Button variant="link" asChild className="text-gray-400 hover:text-white">
                        <Link to="/login">Back to Login</Link>
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
};

export default ForgotPassword;
