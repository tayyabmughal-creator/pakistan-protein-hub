import ProductList from "./ProductList";

const Deals = () => {
    // For now, Deals can just be a wrapper around ProductList 
    // functionality-wise, perhaps filtered by a 'deal' query param later.
    // Or we can just show a placeholder "No active deals" if we prefer.
    // Let's reuse ProductList but maybe with a custom title if we could pass props, 
    // but ProductList uses searchParams. 

    // Simplest approach: A dedicated page saying "Coming Soon" or showing specific products.
    // Let's make a coming soon page for now as backend might not have 'deals' flag yet.

    return (
        <div className="min-h-screen bg-[#050505] py-20 text-white flex items-center justify-center">
            <div className="text-center">
                <h1 className="font-heading text-5xl font-bold mb-4 text-primary">Exclusive Deals</h1>
                <p className="text-xl text-gray-400 max-w-lg mx-auto">
                    We are currently curating the best offers for you. Check back soon for exclusive discounts and bundles!
                </p>
            </div>
        </div>
    );
};

export default Deals;
