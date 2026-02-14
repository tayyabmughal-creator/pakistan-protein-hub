import { Mail, Phone, MapPin, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { toast } from "sonner";

const Contact = () => {
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);

        const form = e.currentTarget;
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        try {
            const response = await fetch("https://formspree.io/f/mzdargld", {
                method: "POST",
                body: JSON.stringify(data),
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                toast.success("Message sent successfully!", {
                    description: "We'll get back to you as soon as possible."
                });
                form.reset();
            } else {
                const errorData = await response.json();
                console.error("Formspree error:", errorData);
                toast.error("Failed to send message.", {
                    description: "Please try again later or contact us directly."
                });
            }
        } catch (error) {
            console.error("Submission error:", error);
            toast.error("Something went wrong.", {
                description: "Please check your internet connection."
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#050505] py-20 text-white">
            <div className="container mx-auto px-4 max-w-6xl">
                <div className="text-center mb-16">
                    <h1 className="font-heading text-4xl md:text-5xl font-bold mb-4 text-primary">Contact Us</h1>
                    <p className="text-gray-400 max-w-2xl mx-auto">
                        Have questions about your order or need product recommendations? We're here to help!
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    {/* Contact Info */}
                    <div className="space-y-8">
                        <div className="bg-[#111] p-8 rounded-2xl border border-white/10">
                            <h2 className="text-2xl font-bold mb-6">Get in Touch</h2>
                            <div className="space-y-6">
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                                        <MapPin className="w-6 h-6 text-primary" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg mb-1">Visit Us</h3>
                                        <p className="text-gray-400">Shop #12, Phase 6, DHA Lahore, Pakistan</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                                        <Phone className="w-6 h-6 text-primary" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg mb-1">Call Us</h3>
                                        <p className="text-gray-400">+92 300 1234567</p>
                                        <p className="text-gray-500 text-sm">Mon - Sat, 9am - 9pm</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                                        <Mail className="w-6 h-6 text-primary" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg mb-1">Email Us</h3>
                                        <p className="text-gray-400">support@powerfuel.pk</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Contact Form */}
                    <div className="bg-[#111] p-8 rounded-2xl border border-white/10">
                        <h2 className="text-2xl font-bold mb-6">Send a Message</h2>
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-300">Name</label>
                                    <Input name="name" placeholder="Your Name" className="bg-black/20 border-white/10 focus:border-primary" required />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-300">Email</label>
                                    <Input name="email" type="email" placeholder="your@email.com" className="bg-black/20 border-white/10 focus:border-primary" required />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-300">Subject</label>
                                <Input name="subject" placeholder="How can we help?" className="bg-black/20 border-white/10 focus:border-primary" required />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-300">Message</label>
                                <Textarea name="message" placeholder="Type your message here..." className="bg-black/20 border-white/10 focus:border-primary min-h-[150px]" required />
                            </div>

                            <Button type="submit" disabled={isLoading} className="w-full bg-primary text-black hover:bg-white font-bold h-12">
                                {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                                {isLoading ? "Sending..." : "Send Message"}
                            </Button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Contact;
