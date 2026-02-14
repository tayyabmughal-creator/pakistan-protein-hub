const Shipping = () => {
    return (
        <div className="min-h-screen bg-[#050505] py-20 text-white">
            <div className="container mx-auto px-4 max-w-4xl">
                <h1 className="font-heading text-4xl md:text-5xl font-bold mb-8 text-primary">Shipping Policy</h1>

                <div className="space-y-8 text-gray-300 leading-relaxed bg-[#111] p-8 rounded-2xl border border-white/10">
                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">Delivery Timeline</h2>
                        <p>
                            We strive to deliver your orders as quickly as possible.
                        </p>
                        <ul className="list-disc pl-6 mt-4 space-y-2">
                            <li><strong>Lahore:</strong> Same day or next day delivery.</li>
                            <li><strong>Major Cities (Karachi, Islamabad, etc.):</strong> 2-3 working days.</li>
                            <li><strong>Other Areas:</strong> 3-5 working days.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">Shipping Charges</h2>
                        <p>
                            We offer free shipping on orders above Rs. 10,000. For orders below this amount, a flat rate of Rs. 250 applies nationwide.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">Order Tracking</h2>
                        <p>
                            Once your order is dispatched, you will receive a tracking number via SMS and Email. You can use this number to track your package on our courier partner's website.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default Shipping;
