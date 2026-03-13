import { useQuery } from "@tanstack/react-query";
import { Clock3, TicketPercent } from "lucide-react";
import { fetchHomePageSettings, fetchPromotions } from "@/lib/api";
import Loader from "@/components/Loader";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const Deals = () => {
    const { data, isLoading, isError } = useQuery({
        queryKey: ["promotions"],
        queryFn: fetchPromotions,
    });
    const { data: settings } = useQuery({
        queryKey: ["homepage-settings"],
        queryFn: fetchHomePageSettings,
    });

    const promotions = data || [];
    const featuredDealEnabled = settings?.deal_enabled ?? true;
    const featuredDealExpired = settings?.deal_is_expired ?? false;
    const showFeaturedDeal = featuredDealEnabled && !featuredDealExpired;

    return (
        <div className="min-h-screen bg-[#050505] py-20 text-white">
            <div className="container mx-auto px-4">
                <div className="mb-12 text-center">
                    <h1 className="font-heading text-5xl font-bold mb-4 text-primary">Exclusive Deals</h1>
                    <p className="text-xl text-gray-400 max-w-2xl mx-auto">
                        Active promotion codes available right now.
                    </p>
                </div>

                {showFeaturedDeal && (
                    <div className={`mb-12 overflow-hidden rounded-3xl border p-8 shadow-xl ${featuredDealExpired ? "border-white/10 bg-white/5" : "border-primary/30 bg-primary/10"}`}>
                        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
                            <div className="max-w-2xl">
                                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm uppercase tracking-[0.25em] text-primary">
                                    <TicketPercent className="h-4 w-4" />
                                    {settings?.deal_badge || "Featured sale"}
                                </div>
                                <h2 className="mb-3 font-heading text-4xl font-bold">
                                    {settings?.deal_title || "MEGA SALE"}
                                </h2>
                                <p className="mb-4 text-lg text-gray-300">
                                    {settings?.deal_subtitle || "Up to 50% OFF on all proteins"}
                                </p>
                                {settings?.effective_deal_code && (
                                    <p className="text-sm text-gray-400">
                                        Promo code: <span className="rounded-lg bg-primary/20 px-3 py-1 font-mono font-bold text-primary">{settings.effective_deal_code}</span>
                                    </p>
                                )}
                            </div>

                            <div className="min-w-[260px] rounded-2xl border border-white/10 bg-black/20 p-6">
                                <div className="mb-3 flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-gray-400">
                                    <Clock3 className="h-4 w-4" />
                                    Campaign status
                                </div>
                                <div className="mb-4 text-2xl font-heading font-bold text-primary">
                                    Live now
                                </div>
                                <p className="mb-5 text-sm text-gray-400">
                                    {`Ends ${new Date(settings?.effective_deal_target_date || settings?.deal_target_date).toLocaleString()}`}
                                </p>
                                <Button asChild className="w-full">
                                    <Link to="/">View Homepage Campaign</Link>
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {isLoading ? (
                    <div className="flex justify-center py-20">
                        <Loader size={40} />
                    </div>
                ) : isError ? (
                    <div className="text-center py-16 text-red-400">
                        Failed to load active promotions.
                    </div>
                ) : promotions.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                        No active promotions are available at the moment.
                    </div>
                ) : (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {promotions.map((promotion: any) => (
                            <div
                                key={promotion.id}
                                className="rounded-2xl border border-white/10 bg-[#111] p-6 shadow-xl"
                            >
                                <div className="mb-4 inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-bold text-primary">
                                    {promotion.discount_percentage}% OFF
                                </div>
                                <h2 className="mb-2 font-heading text-2xl font-bold">{promotion.code}</h2>
                                <p className="mb-6 text-gray-400">
                                    {promotion.description || "Use this code at checkout while it remains active."}
                                </p>
                                <p className="text-sm text-gray-500">
                                    Valid until {new Date(promotion.valid_to).toLocaleDateString()}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Deals;
