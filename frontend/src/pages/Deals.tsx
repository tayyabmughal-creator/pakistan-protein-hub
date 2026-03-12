import { useQuery } from "@tanstack/react-query";
import { fetchPromotions } from "@/lib/api";
import Loader from "@/components/Loader";

const Deals = () => {
    const { data, isLoading, isError } = useQuery({
        queryKey: ["promotions"],
        queryFn: fetchPromotions,
    });

    const promotions = data || [];

    return (
        <div className="min-h-screen bg-[#050505] py-20 text-white">
            <div className="container mx-auto px-4">
                <div className="mb-12 text-center">
                    <h1 className="font-heading text-5xl font-bold mb-4 text-primary">Exclusive Deals</h1>
                    <p className="text-xl text-gray-400 max-w-2xl mx-auto">
                        Active promotion codes available right now.
                    </p>
                </div>

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
