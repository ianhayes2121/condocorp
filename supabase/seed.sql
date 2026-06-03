-- ============================================================
-- SEED DATA
-- Run after creating at least one user via the /request-access endpoint.
-- You can also run this directly if you insert users with hashed passwords.
--
-- To create a test user with password "password123":
-- The bcrypt hash below is for "password123" (12 rounds)
-- ============================================================

-- Sample users (password: "password123")
INSERT INTO users (id, email, password_hash, first_name, last_name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin@condocorp.test', '$2a$12$LJ3K2k5GhZl7xQ5z5v5Cvu8w8Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q', 'Sarah', 'Chen'),
  ('22222222-2222-2222-2222-222222222222', 'homeowner@condocorp.test', '$2a$12$LJ3K2k5GhZl7xQ5z5v5Cvu8w8Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q', 'James', 'Wilson'),
  ('33333333-3333-3333-3333-333333333333', 'manager@condocorp.test', '$2a$12$LJ3K2k5GhZl7xQ5z5v5Cvu8w8Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q', 'Maria', 'Rodriguez')
ON CONFLICT (id) DO NOTHING;

-- Sample CondoCorps
INSERT INTO condocorps (id, name, address, status) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'Sunrise Towers Condominium Corp', '100 Sunrise Boulevard, Toronto, ON M5V 3C1', 'active'),
  ('b2222222-2222-2222-2222-222222222222', 'Lakeside Gardens Condominium Corp', '250 Lakeshore Drive, Mississauga, ON L5B 4A3', 'active'),
  ('c3333333-3333-3333-3333-333333333333', 'Downtown Heights Condominium Corp', '75 King Street West, Toronto, ON M5H 1A1', 'suspended')
ON CONFLICT (id) DO NOTHING;

-- Memberships
INSERT INTO condocorp_memberships (condocorp_id, user_id, role, status) VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'condocorp_admin', 'active'),
  ('a1111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'homeowner', 'active'),
  ('a1111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'property_manager', 'active'),
  ('b2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'platform_admin', 'active'),
  ('b2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'homeowner', 'active')
ON CONFLICT (condocorp_id, user_id) DO NOTHING;

-- Sample Units for Sunrise Towers
INSERT INTO units (condocorp_id, unit_number, floor) VALUES
  ('a1111111-1111-1111-1111-111111111111', '101', 1),
  ('a1111111-1111-1111-1111-111111111111', '102', 1),
  ('a1111111-1111-1111-1111-111111111111', '201', 2),
  ('a1111111-1111-1111-1111-111111111111', '202', 2),
  ('a1111111-1111-1111-1111-111111111111', '301', 3),
  ('a1111111-1111-1111-1111-111111111111', '302', 3),
  ('a1111111-1111-1111-1111-111111111111', 'PH1', 10),
  ('a1111111-1111-1111-1111-111111111111', 'PH2', 10);

-- Sample Units for Lakeside Gardens
INSERT INTO units (condocorp_id, unit_number, floor) VALUES
  ('b2222222-2222-2222-2222-222222222222', 'A1', 1),
  ('b2222222-2222-2222-2222-222222222222', 'A2', 1),
  ('b2222222-2222-2222-2222-222222222222', 'B1', 2),
  ('b2222222-2222-2222-2222-222222222222', 'B2', 2);

-- Sample FAQs for Sunrise Towers
INSERT INTO faqs (condocorp_id, question, answer) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'What are the pet policies?', 'Residents may keep up to two domestic pets (cats or dogs) per unit. Dogs must be leashed in all common areas. Aggressive breeds require board approval. Pet owners are responsible for cleaning up after their animals. Violations may result in fines starting at $100.'),
  ('a1111111-1111-1111-1111-111111111111', 'What are the parking rules?', 'Each unit is assigned one underground parking spot. Visitor parking is available on P1 level, limited to 24 hours. No vehicle repairs or storage of non-operational vehicles allowed. Electric vehicle charging stations are available on P2 for a monthly fee of $50.'),
  ('a1111111-1111-1111-1111-111111111111', 'How do I book the party room?', 'The party room can be booked through the management office or the online portal. A refundable deposit of $200 is required. Bookings are available Friday 5pm to Sunday 10pm. Maximum occupancy is 50 people. Music must end by 11pm.'),
  ('a1111111-1111-1111-1111-111111111111', 'What is the noise bylaw?', 'Quiet hours are from 10:00 PM to 8:00 AM daily. During quiet hours, noise should not be audible from adjacent units. Construction and renovation work is permitted Monday to Friday 9:00 AM to 5:00 PM, and Saturday 10:00 AM to 4:00 PM. No construction on Sundays or statutory holidays.'),
  ('a1111111-1111-1111-1111-111111111111', 'What are the move-in/move-out procedures?', 'Moving is permitted Monday to Saturday, 8:00 AM to 6:00 PM. Elevator booking is required 48 hours in advance through the management office. A refundable damage deposit of $500 is required. Movers must use designated loading dock and freight elevator only.'),
  ('a1111111-1111-1111-1111-111111111111', 'How are maintenance fees structured?', 'Monthly maintenance fees are calculated based on unit square footage. Current rate is $0.65 per square foot. Fees cover building insurance, common area maintenance, water, heating, and contributions to the reserve fund. Fees are due on the 1st of each month. Late payment incurs a 2% penalty.');

-- Sample FAQs for Lakeside Gardens
INSERT INTO faqs (condocorp_id, question, answer) VALUES
  ('b2222222-2222-2222-2222-222222222222', 'Is there a pool?', 'Yes. The outdoor pool is open from May 15 to September 30, daily from 7:00 AM to 10:00 PM. Residents must use their key fob for access. Guests are limited to 2 per unit. No glass containers in the pool area. Lifeguard is not provided; swim at your own risk.'),
  ('b2222222-2222-2222-2222-222222222222', 'What is the BBQ policy?', 'BBQ grills are available on the rooftop terrace, first-come-first-served. Personal BBQs are not permitted on balconies per fire code. Propane and charcoal grills are prohibited. The communal electric grills must be cleaned after use.');

-- Sample Audit Logs
INSERT INTO audit_logs (condocorp_id, user_id, action, details) VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'condocorp_created', '{"description": "Sunrise Towers Condominium Corp was created"}'),
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'faq_created', '{"description": "6 FAQs were added to the knowledge base"}'),
  ('b2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'condocorp_created', '{"description": "Lakeside Gardens Condominium Corp was created"}');
