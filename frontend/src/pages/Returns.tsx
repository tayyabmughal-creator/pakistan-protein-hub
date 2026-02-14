const Returns = () => {
    return (
        <div className="min-h-screen bg-[#050505] py-20 text-white">
            <div className="container mx-auto px-4 max-w-4xl">
                <h1 className="font-heading text-4xl md:text-5xl font-bold mb-8 text-primary">Returns & Refunds</h1>

                <div className="space-y-8 text-gray-300 leading-relaxed bg-[#111] p-8 rounded-2xl border border-white/10">
                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">Return Policy</h2>
                        <p>
                            We offer a 7-day return policy. If 7 days have gone by since your purchase, unfortunately, we can’t offer you a refund or exchange.
                            To be eligible for a return, your item must be unused and in the same condition that you received it. It must also be in the original packaging.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">Non-returnable items</h2>
                        <ul className="list-disc pl-6 mt-4 space-y-2">
                            <li>Open or unsealed supplements.</li>
                            <li>Perishable goods.</li>
                            <li>Gift cards.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-white mb-4">Refunds</h2>
                        <p>
                            Once your return is received and inspected, we will send you an email to notify you that we have received your returned item. We will also notify you of the approval or rejection of your refund.
                            If you are approved, then your refund will be processed, and a credit will automatically be applied to your credit card or original method of payment, within a certain amount of days.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default Returns;
