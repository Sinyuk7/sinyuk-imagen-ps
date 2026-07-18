"""Contract node identity 测试。"""

import unittest

from helpers import load_module


nodes = load_module("imagen_bridge_nodes", "nodes.py")


class ContractNodeTests(unittest.TestCase):
    def test_exposes_exactly_two_stable_class_ids(self):
        self.assertEqual(
            set(nodes.NODE_CLASS_MAPPINGS),
            {
                "ImagenWorkflowBindingContract",
                "ImagenWorkflowTypeContract",
            },
        )

    def test_each_node_exposes_only_contract_widget(self):
        for node_class in nodes.NODE_CLASS_MAPPINGS.values():
            inputs = node_class.INPUT_TYPES()
            self.assertEqual(set(inputs), {"required"})
            self.assertEqual(set(inputs["required"]), {"contract"})
            self.assertEqual(node_class.RETURN_TYPES, ())
            self.assertTrue(node_class.OUTPUT_NODE)


if __name__ == "__main__":
    unittest.main()
