import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const FAQ = () => {
    return (
        <div className="min-h-screen bg-[#050505] py-20 text-white">
            <div className="container mx-auto px-4 max-w-3xl">
                <h1 className="font-heading text-4xl md:text-5xl font-bold mb-8 text-primary text-center">Frequently Asked Questions</h1>

                <Accordion type="single" collapsible className="w-full space-y-4">
                    <AccordionItem value="item-1" className="border border-white/10 rounded-xl px-4 bg-[#111]">
                        <AccordionTrigger className="text-lg font-medium hover:text-primary hover:no-underline">Are your products authentic?</AccordionTrigger>
                        <AccordionContent className="text-gray-400">
                            Yes, absolutely. We source all our supplements directly from authorized distributors and manufacturers. Every product comes with an authenticity guarantee and verification method.
                        </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="item-2" className="border border-white/10 rounded-xl px-4 bg-[#111]">
                        <AccordionTrigger className="text-lg font-medium hover:text-primary hover:no-underline">How long does shipping take?</AccordionTrigger>
                        <AccordionContent className="text-gray-400">
                            We aim to deliver within 24-48 hours for major cities (Lahore, Karachi, Islamabad) and 3-5 working days for minimal areas.
                        </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="item-3" className="border border-white/10 rounded-xl px-4 bg-[#111]">
                        <AccordionTrigger className="text-lg font-medium hover:text-primary hover:no-underline">What payment methods do you accept?</AccordionTrigger>
                        <AccordionContent className="text-gray-400">
                            We accept Cash on Delivery (COD), Direct Bank Transfer, and Credit/Debit Cards (coming soon).
                        </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="item-4" className="border border-white/10 rounded-xl px-4 bg-[#111]">
                        <AccordionTrigger className="text-lg font-medium hover:text-primary hover:no-underline">Can I return a product?</AccordionTrigger>
                        <AccordionContent className="text-gray-400">
                            Yes, we have a 7-day return policy for sealed and unopened products. Please check our Returns Policy page for more details.
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </div>
        </div>
    );
};

export default FAQ;
