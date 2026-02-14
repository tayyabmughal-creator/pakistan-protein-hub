const About = () => {
    return (
        <div className="min-h-screen bg-[#050505] py-20 text-white">
            <div className="container mx-auto px-4 max-w-4xl">
                <h1 className="font-heading text-4xl md:text-5xl font-bold mb-8 text-primary">About PowerFuel</h1>

                <div className="space-y-8 text-gray-300 leading-relaxed text-lg">
                    <p>
                        Welcome to <span className="text-white font-bold">PowerFuel</span>, Pakistan's premium destination for authentic supplements and fitness nutrition.
                        We are dedicated to fueling your fitness journey with the highest quality products from world-renowned brands.
                    </p>

                    <div>
                        <h2 className="text-2xl font-bold text-white mb-4">Our Mission</h2>
                        <p>
                            Our mission is to make premium nutrition accessible to everyone in Pakistan. We believe that achieving your fitness goals shouldn't be compromised by counterfeit products or exorbitant prices. We strive to provide a seamless shopping experience, expert advice, and a community that supports your growth.
                        </p>
                    </div>

                    <div>
                        <h2 className="text-2xl font-bold text-white mb-4">Why Choose Us?</h2>
                        <ul className="list-disc pl-6 space-y-2">
                            <li><strong className="text-white">100% Authentic Products:</strong> We source directly from authorized distributors.</li>
                            <li><strong className="text-white">Fatest Delivery:</strong> We offer localized shipping across Pakistan.</li>
                            <li><strong className="text-white">Best Prices:</strong> Competitive pricing without compromising on quality.</li>
                            <li><strong className="text-white">Customer Support:</strong> Dedicated team to assist you with your queries.</li>
                        </ul>
                    </div>

                    <div>
                        <h2 className="text-2xl font-bold text-white mb-4">Our Story</h2>
                        <p>
                            Founded in 2024, PowerFuel started with a simple observation: the lack of reliable, authentic supplement sources in the local market.
                            What began as a small passion project has grown into a trusted brand serving thousands of athletes, bodybuilders, and fitness enthusiasts nationwide.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default About;
